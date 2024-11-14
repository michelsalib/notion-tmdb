import axios, { AxiosInstance } from "axios";
import { readFile, writeFile } from "fs/promises";
import { fluentProvide } from "inversify-binding-decorators";
import { isMatch } from "matcher";
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

  async *sync(
    notionClient: NotionClient,
    dbConfig: GoCardlessDbConfig,
  ): AsyncGenerator<string> {
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

          if (
            !process.env["AZURE_FUNCTIONS_ENVIRONMENT"] &&
            !process.env["WEBSITE_RUN_FROM_PACKAGE"]
          ) {
            // store backup
            await writeFile(
              new URL(`../../../../support/${account}.json`, import.meta.url),
              JSON.stringify(transactions.data, null, 2),
            );

            console.log("Written backup");
          }

          return [
            ...transactions.data.transactions.booked,
            ...transactions.data.transactions.pending,
          ] as Transaction[];
        } catch {
          const mock = await JSON.parse(
            await readFile(
              new URL(`../../../../support/${account}.json`, import.meta.url),
              {
                encoding: "utf8",
              },
            ),
          );

          console.log("Used backup");

          return [
            ...mock.transactions.booked,
            ...mock.transactions.pending,
          ] as Transaction[];
        }
      }),
    );

    const transactions = accountsTransactions.flatMap((t) => t);

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
      const entry = this.transactionToEntry(transaction, dbConfig);

      await notionClient.createPage({
        ...entry,
        parent: {
          database_id: dbConfig.id,
        },
      });

      yield `Inserted transaction ${transaction.remittanceInformationUnstructuredArray.join(", ")}`;
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
          date: {
            start: new Date().toISOString(),
          },
        },
      },
    };

    const name = transaction.remittanceInformationUnstructuredArray.join(", ");

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
          start: transaction.valueDate,
        },
      };
    }

    if (dbConfig.classification) {
      item.properties[dbConfig.classification] = {
        multi_select: dbConfig.classificationRules
          .filter((r) => r.matchers.some((matcher) => isMatch(name, matcher)))
          .map((r) => ({ name: r.category })),
      };
    }

    return item;
  }
}
