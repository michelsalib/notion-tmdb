import type { AxiosInstance } from "axios";
import { readFile, writeFile } from "fs/promises";
import { isMatch } from "matcher";
import { inject, injectable } from "tsyringe";
import { GOCARDLESS_ID, GOCARDLESS_SECRET, LOGGER } from "../../fx/keys.js";
import type { Logger } from "../../fx/logger/Logger.js";
import type {
  Bank,
  GoCardlessAccount,
  GoCardlessDbConfig,
  NotionItem,
  Suggestion,
} from "../../types.js";
import type { DataProvider } from "../DataProvider.js";
import { createProviderClient } from "../httpClient.js";
import { NotionClient } from "../Notion/NotionClient.js";

// GoCardless access tokens live 24h; renew early so one can't expire in flight.
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

// The on-disk transaction cache is a local dev convenience (GoCardless rate
// limits hard: 4 calls per account per day). `support/` is .dockerignore'd, so
// it must never be touched in the deployed image.
const USE_LOCAL_TRANSACTION_CACHE = process.env["NODE_ENV"] !== "production";

interface Transaction {
  account: string;
  transactionId: string;
  valueDate?: string;
  bookingDate: string;
  internalTransactionId: string;
  transactionAmount: {
    amount: string;
    currency: string;
  };
  remittanceInformationUnstructuredArray?: string[];
  creditorName?: string;
  remittanceInformationUnstructured?: string;
}

@injectable()
export class GoCardlessClient implements DataProvider<"GoCardless"> {
  private client?: AxiosInstance;
  private tokenExpiresAt = 0;
  private pendingClient?: Promise<AxiosInstance>;

  constructor(
    @inject(GOCARDLESS_ID) private readonly clientId: string,
    @inject(GOCARDLESS_SECRET) private readonly clientsecret: string,
    @inject(LOGGER) private readonly logger: Logger,
  ) {}

  // Each public method needs an authenticated client. Minting a new token per
  // call wasted a request against GoCardless' daily quota — and `retrieveAccount`
  // alone did it twice (once for itself, once via `listBanks`).
  private async createClient(): Promise<AxiosInstance> {
    if (this.client && Date.now() < this.tokenExpiresAt) {
      return this.client;
    }

    // Collapse concurrent callers onto one in-flight token exchange.
    this.pendingClient ??= this.authenticate().finally(() => {
      this.pendingClient = undefined;
    });

    return this.pendingClient;
  }

  private async authenticate(): Promise<AxiosInstance> {
    const client = createProviderClient(this.logger, {
      baseURL: "https://bankaccountdata.gocardless.com/api/v2/",
    });

    const token = await client.post("/token/new/", {
      secret_id: this.clientId,
      secret_key: this.clientsecret,
    });

    client.defaults.headers["Authorization"] = `Bearer ${token.data.access}`;

    this.tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
    this.client = client;

    return client;
  }

  async listBanks(): Promise<Bank[]> {
    const client = await this.createClient();

    const banks = await client.get("/institutions/", {
      params: {
        country: "fr",
      },
    });

    return banks.data;
  }

  async addAccount(id: string, referer: string): Promise<string> {
    const client = await this.createClient();
    const link = await client.post("/requisitions/", {
      institution_id: id,
      user_language: "fr",
      redirect: `${referer}api/accounts`,
    });

    return link.data.link;
  }

  async retrieveAccount(connectionId: string): Promise<GoCardlessAccount> {
    const client = await this.createClient();
    const accounts = await client.get(`/requisitions/${connectionId}/`);

    const banks = await this.listBanks();
    const bank = banks.find((b) => b.id == accounts.data.institution_id)!;

    return {
      logo: bank.logo,
      requisitionId: connectionId,
      accountIds: accounts.data.accounts,
      name: bank.name,
    };
  }

  async *sync(
    notionClient: NotionClient,
    dbConfig: GoCardlessDbConfig,
  ): AsyncGenerator<string> {
    const accounts = dbConfig.goCardlessAccounts.flatMap((f) => f.accountIds);

    const client = await this.createClient();

    // get transactions
    const accountsTransactions = await Promise.all(
      accounts.map(async (account) => {
        try {
          const [transactionsResponse, detailsResponse] = await Promise.all([
            client.get(`/accounts/${account}/transactions/`),
            client.get(`/accounts/${account}/details/`),
          ]);

          // populate transactions with account details
          const transactions: Transaction[] = [
            ...transactionsResponse.data.transactions.booked,
            ...transactionsResponse.data.transactions.pending,
          ].map((t) => ({
            ...t,
            account:
              detailsResponse.data.account.name ||
              detailsResponse.data.account.ownerName,
          }));

          await this.writeTransactionCache(account, transactions);

          return transactions;
        } catch (err) {
          const cached = await this.readTransactionCache(account);

          if (cached) {
            return cached;
          }

          // No usable cache (always the case in prod): the sync genuinely
          // failed and the caller needs to see why.
          throw err;
        }
      }),
    );

    const transactions = accountsTransactions
      .flat()
      .reduce<Transaction[]>((res, cur) => {
        if (!res.find((i) => i.transactionId == cur.transactionId)) {
          res.push(cur);
        }

        return res;
      }, []);

    yield `Synching ${transactions.length} from GoCardless.`;

    const existingTransactionIds = await notionClient.listExistingItems(
      dbConfig,
      transactions.map((t) => t.transactionId),
    );

    const transactionToInsert = transactions.filter(
      (t) => !existingTransactionIds.includes(t.transactionId),
    );

    yield `Adding ${transactionToInsert.length} into Notion.`;

    for (const transaction of transactionToInsert) {
      const { name, entry } = this.transactionToEntry(transaction, dbConfig);

      await notionClient.createPage({
        ...entry,
        parent: {
          database_id: dbConfig.id,
        },
      });

      yield `Inserted transaction ${name}`;
    }

    yield `Sync done.`;
  }

  private cachePath(account: string): URL {
    return new URL(`../../../../support/${account}.json`, import.meta.url);
  }

  // Best-effort: a cache write must never fail the sync. The previous version
  // wrote unconditionally (its guard tested two Azure env vars that no longer
  // exist anywhere), so in the deployed image the write hit a `support/` dir
  // that .dockerignore keeps out, threw, and dropped into the read fallback —
  // which then threw on the same missing path and failed the whole sync.
  private async writeTransactionCache(
    account: string,
    transactions: Transaction[],
  ): Promise<void> {
    if (!USE_LOCAL_TRANSACTION_CACHE) {
      return;
    }

    try {
      await writeFile(
        this.cachePath(account),
        JSON.stringify(transactions, null, 2),
      );
      this.logger.log("Wrote local GoCardless transaction cache", { account });
    } catch (err) {
      this.logger.warn("Could not write local GoCardless transaction cache", {
        account,
        error: String(err),
      });
    }
  }

  private async readTransactionCache(
    account: string,
  ): Promise<Transaction[] | undefined> {
    if (!USE_LOCAL_TRANSACTION_CACHE) {
      return undefined;
    }

    try {
      const cached = await readFile(this.cachePath(account), {
        encoding: "utf8",
      });
      this.logger.log("Used local GoCardless transaction cache", { account });

      return JSON.parse(cached) as Transaction[];
    } catch {
      return undefined;
    }
  }

  async search(): Promise<Suggestion[]> {
    throw new Error("Not supported");
  }

  loadNotionEntry(): Promise<any> {
    throw new Error("Method not implemented.");
  }

  private transactionToEntry(
    transaction: Transaction,
    dbConfig: GoCardlessDbConfig,
  ): {
    entry: NotionItem;
    name: string;
  } {
    const item: NotionItem = {
      properties: {
        [dbConfig.url]: {
          rich_text: [
            {
              text: { content: transaction.transactionId },
            },
          ],
        },
        [dbConfig.status]: {
          date: {
            start: new Date().toISOString(),
          },
        },
      },
    };

    const name = [
      transaction.creditorName,
      transaction.remittanceInformationUnstructured,
      ...(transaction.remittanceInformationUnstructuredArray || []),
    ]
      .filter((i) => !!i)
      .join(", ");

    if (dbConfig.title) {
      item.properties[dbConfig.title] = {
        title: [
          {
            text: {
              content: name,
            },
          },
        ],
      };
    }

    if (dbConfig.account) {
      item.properties[dbConfig.account] = {
        select: {
          name: transaction.account,
        },
      };
    }

    if (dbConfig.amount) {
      item.properties[dbConfig.amount] = {
        number: Number(transaction.transactionAmount.amount),
      };
    }

    if (dbConfig.bookingDate) {
      item.properties[dbConfig.bookingDate] = {
        date: {
          start: transaction.bookingDate,
        },
      };
    }

    if (dbConfig.valueDate) {
      item.properties[dbConfig.valueDate] = {
        date: {
          start: transaction.valueDate || transaction.bookingDate,
        },
      };
    }

    if (dbConfig.classification) {
      // `?? []` — configs saved before classification rules existed have no
      // such field, and reading `.filter` off undefined would fail the sync.
      const categories = (dbConfig.classificationRules ?? []).filter((r) =>
        r.matchers.some((matcher) => isMatch(name, matcher)),
      );

      item.properties[dbConfig.classification] = {
        multi_select: categories.map((r) => ({ name: r.category })),
      };
    }

    return {
      entry: item,
      name,
    };
  }
}
