import axios, { AxiosInstance } from "axios";
import { readFile, writeFile } from "fs/promises";
import { inject } from "inversify";
import { fluentProvide } from "inversify-binding-decorators";
import { isMatch } from "matcher";
import {
  DATA_PROVIDER,
  DOMAIN as DOMAIN_KEY,
  GOCARDLESS_ID,
  GOCARDLESS_SECRET,
} from "../../fx/keys.js";
import type {
  Bank,
  DOMAIN,
  GoCardlessAccount,
  GoCardlessDbConfig,
  NotionItem,
  Suggestion,
} from "../../types.js";
import { DataProvider } from "../DataProvider.js";
import { NotionClient } from "../Notion/NotionClient.js";
import { errorLogger, requestLogger, responseLogger } from "axios-logger";

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

@(fluentProvide(DATA_PROVIDER)
  .when(
    (r) => r.parentContext.container.get<DOMAIN>(DOMAIN_KEY) == "GoCardless",
  )
  .done())
export class GoCardlessClient implements DataProvider<"GoCardless"> {
  constructor(
    @inject(GOCARDLESS_ID) private readonly clientId: string,
    @inject(GOCARDLESS_SECRET) private readonly clientsecret: string,
  ) {}

  private async createClient(): Promise<AxiosInstance> {
    const client = axios.create({
      baseURL: "https://bankaccountdata.gocardless.com/api/v2/",
    });

    client.interceptors.request.use(requestLogger, errorLogger);
    client.interceptors.response.use(responseLogger, errorLogger);

    const token = await client.post("/token/new/", {
      secret_id: this.clientId,
      secret_key: this.clientsecret,
    });

    client.defaults.headers["Authorization"] = `Bearer ${token.data.access}`;

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

          if (
            !process.env["AZURE_FUNCTIONS_ENVIRONMENT"] &&
            !process.env["WEBSITE_RUN_FROM_PACKAGE"]
          ) {
            // store backup
            await writeFile(
              new URL(`../../../../support/${account}.json`, import.meta.url),
              JSON.stringify(transactions, null, 2),
            );

            console.log("Written backup");
          }

          return transactions;
        } catch {
          const mock: Transaction[] = await JSON.parse(
            await readFile(
              new URL(`../../../../support/${account}.json`, import.meta.url),
              {
                encoding: "utf8",
              },
            ),
          );

          console.log("Used backup");

          return mock;
        }
      }),
    );

    const transactions = accountsTransactions
      .flatMap((t) => t)
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

  async search(): Promise<Suggestion[]> {
    throw "Not supported";
  }

  loadNotionEntry(): Promise<any> {
    throw "Method not implemented.";
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
      const categories = dbConfig.classificationRules.filter((r) =>
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
