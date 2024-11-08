import axios, { AxiosInstance } from "axios";
import { readFile } from "fs/promises";
import { fluentProvide } from "inversify-binding-decorators";
import { DATA_PROVIDER, DOMAIN as DOMAIN_KEY } from "../../fx/keys.js";
import {
  DOMAIN,
  GoCardlessDbConfig,
  NotionItem,
  Suggestion,
} from "../../types.js";
import { DataProvider } from "../DataProvider.js";
import { NotionClient } from "../Notion/NotionClient.js";

interface Transaction {
  transactionId: string;
  valueDate: string;
  bookingDate: string;
  internalTransactionId: string;
  transactionAmount: {
    amount: string;
    currency: string;
  };
  remittanceInformationUnstructuredArray: string[];
}

@(fluentProvide(DATA_PROVIDER)
  .when(
    (r) => r.parentContext.container.get<DOMAIN>(DOMAIN_KEY) == "GoCardless",
  )
  .done())
export class GoCardlessClient implements DataProvider<"GoCardless"> {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: "https://bankaccountdata.gocardless.com/api/v2/",
    });
  }

  async sync(
    notionClient: NotionClient,
    dbConfig: GoCardlessDbConfig,
  ): Promise<void> {
    // connect to go cardless
    const token = await this.client.post("/token/new/", {
      secret_id: dbConfig.goCardlessId,
      secret_key: dbConfig.goCardlessKey,
    });
    const goCardlessToken = token.data.access;

    // get transactions
    const accountsTransactions = await Promise.all(
      dbConfig.goCardlessAccounts.map(async (account) => {
        try {
          const transactions = await this.client.get(
            `/accounts/${account}/transactions/`,
            {
              headers: {
                Authorization: `Bearer ${goCardlessToken}`,
              },
            },
          );

          return [
            ...transactions.data.transactions.booked,
            ...transactions.data.transactions.pending,
          ] as Transaction[];
        } catch {
          const mock = await JSON.parse(
            await readFile(new URL(`./${account}.json`, import.meta.url), {
              encoding: 'utf8'
            }),
          );

          return [
            ...mock.transactions.booked,
            ...mock.transactions.pending,
          ] as Transaction[];
        }
      }),
    );

    const transactions = accountsTransactions.flatMap((t) => t);

    for (const transaction of transactions) {
      const entry = this.transactionToEntry(transaction, dbConfig);

      await notionClient.createPage({
        ...entry,
        parent: {
          database_id: dbConfig.id,
        },
      });
    }
  }

  async search(): Promise<Suggestion[]> {
    throw "Not supported";
  }

  loadNotionEntry(): Promise<NotionItem> {
    throw "Method not implemented.";
  }

  private transactionToEntry(
    transaction: Transaction,
    dbConfig: GoCardlessDbConfig,
  ): NotionItem {
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
          status: {
            name: "Done",
          },
        },
      },
    };

    if (dbConfig.title) {
      item.properties[dbConfig.title] = {
        title: [
          {
            text: {
              content:
                transaction.remittanceInformationUnstructuredArray.join(", "),
            },
          },
        ],
      };
    }

    if (dbConfig.amount) {
      item.properties[dbConfig.amount] = {
        number: Number(transaction.transactionAmount.amount),
      };
    }

    return item;
  }
}
