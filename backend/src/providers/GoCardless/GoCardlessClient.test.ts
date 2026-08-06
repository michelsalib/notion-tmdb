import { describe, expect, test } from "bun:test";
import type { Logger } from "../../fx/logger/Logger.js";
import type { GoCardlessDbConfig } from "../../types.js";
import { GoCardlessClient } from "./GoCardlessClient.js";

const noopLogger: Logger = {
  log() {},
  warn() {},
  error() {},
  bindAxios() {},
};

function makeClient() {
  // The constructor only stashes its arguments, so no container is needed.
  return new GoCardlessClient("id", "secret", noopLogger);
}

function config(
  overrides: Partial<GoCardlessDbConfig> = {},
): GoCardlessDbConfig {
  return {
    id: "db-id",
    url: "urlProp",
    status: "statusProp",
    title: "titleProp",
    valueDate: "valueDateProp",
    bookingDate: "bookingDateProp",
    amount: "amountProp",
    account: "accountProp",
    classification: "classificationProp",
    classificationRules: [],
    goCardlessAccounts: [],
    ...overrides,
  };
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    account: "Current account",
    transactionId: "tx-1",
    bookingDate: "2026-03-04",
    internalTransactionId: "internal-1",
    transactionAmount: { amount: "-12.34", currency: "EUR" },
    creditorName: "SNCF",
    ...overrides,
  };
}

// transactionToEntry is private but is the whole of the mapping logic, and it
// is pure — reach it directly rather than standing up an HTTP fixture.
function mapEntry(client: GoCardlessClient, tx: unknown, cfg: unknown) {
  return (client as any).transactionToEntry(tx, cfg);
}

describe("GoCardlessClient.transactionToEntry", () => {
  test("composes the name from creditor and remittance fields", () => {
    const { name } = mapEntry(
      makeClient(),
      transaction({
        creditorName: "SNCF",
        remittanceInformationUnstructured: "Billet",
        remittanceInformationUnstructuredArray: ["Paris", "Lyon"],
      }),
      config(),
    );

    expect(name).toBe("SNCF, Billet, Paris, Lyon");
  });

  test("skips absent name parts rather than emitting blanks", () => {
    const { name } = mapEntry(
      makeClient(),
      transaction({
        creditorName: undefined,
        remittanceInformationUnstructured: "Virement",
      }),
      config(),
    );

    expect(name).toBe("Virement");
  });

  test("writes the transaction id and amount onto the configured props", () => {
    const { entry } = mapEntry(makeClient(), transaction(), config());

    expect(entry.properties["urlProp"].rich_text[0].text.content).toBe("tx-1");
    expect(entry.properties["amountProp"].number).toBe(-12.34);
    expect(entry.properties["accountProp"].select.name).toBe("Current account");
  });

  test("falls back to bookingDate when valueDate is absent", () => {
    const { entry } = mapEntry(
      makeClient(),
      transaction({ valueDate: undefined, bookingDate: "2026-03-04" }),
      config(),
    );

    expect(entry.properties["valueDateProp"].date.start).toBe("2026-03-04");
  });

  test("applies matching classification rules", () => {
    const { entry } = mapEntry(
      makeClient(),
      transaction({ creditorName: "SNCF VOYAGES" }),
      config({
        classificationRules: [
          { category: "Travel", matchers: ["*SNCF*"] },
          { category: "Food", matchers: ["*CARREFOUR*"] },
        ],
      }),
    );

    expect(entry.properties["classificationProp"].multi_select).toEqual([
      { name: "Travel" },
    ]);
  });

  test("a transaction can match several categories", () => {
    const { entry } = mapEntry(
      makeClient(),
      transaction({ creditorName: "SNCF CARREFOUR" }),
      config({
        classificationRules: [
          { category: "Travel", matchers: ["*SNCF*"] },
          { category: "Food", matchers: ["*CARREFOUR*"] },
        ],
      }),
    );

    expect(entry.properties["classificationProp"].multi_select).toEqual([
      { name: "Travel" },
      { name: "Food" },
    ]);
  });

  test("no rules means no categories, not a crash", () => {
    const { entry } = mapEntry(makeClient(), transaction(), config());

    expect(entry.properties["classificationProp"].multi_select).toEqual([]);
  });

  test("tolerates a config saved before classificationRules existed", () => {
    const cfg = config();
    delete (cfg as Partial<GoCardlessDbConfig>).classificationRules;

    const { entry } = mapEntry(makeClient(), transaction(), cfg);

    expect(entry.properties["classificationProp"].multi_select).toEqual([]);
  });

  test("omits properties the user has not mapped", () => {
    const { entry } = mapEntry(
      makeClient(),
      transaction(),
      config({ title: "", amount: "", classification: "" }),
    );

    expect(entry.properties["titleProp"]).toBeUndefined();
    expect(entry.properties["amountProp"]).toBeUndefined();
    expect(entry.properties["classificationProp"]).toBeUndefined();
  });
});
