const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test("My WorkFlows renders cached rows before refreshing", async () => {
  let resolveFetch;
  const rendered = [];
  const context = {
    workflowListLoads: new Map(), workflowListCache: new Map([["", [{ id: "cached" }]]]),
    workflowCacheEpoch: 1, workflowListRequest: 0, activeView: "documents",
    $: () => ({ value: "" }),
    api: () => new Promise(resolve => { resolveFetch = resolve; }),
    renderWorkflowList: rows => rendered.push(rows?.[0]?.id)
  };
  vm.createContext(context);
  vm.runInContext(section("function fetchWorkflowList(query)", "function renderWorkflowList(projects)"), context);
  const loading = context.loadProjectList();
  assert.deepEqual(rendered, ["cached"]);
  resolveFetch([{ id: "fresh" }]);
  await loading;
  assert.deepEqual(rendered, ["cached", "fresh"]);
});

test("Order Book save waits for confirmation after showing Saving", async () => {
  let resolveSave;
  const notices = [];
  const payload = { id: "order-1", orderNo: "CZ26-0001", customer: "Customer", createNew: true };
  const context = {
    pendingOrderBookSaves: new Map(), currentUser: { id: "user-1" },
    salesCrmState: { orderBook: [], nextOrderBookNo: "CZ26-0001" }, salesCrmLoadedAt: 0,
    salesOrderBookDetailId: "", activeView: "salesDesk", salesDeskScreen: "orderBook",
    isStaffUser: () => false,
    salesData: () => context.salesCrmState,
    showOrderBookSaveNotice: (...args) => notices.push(args),
    api: () => new Promise(resolve => { resolveSave = resolve; }),
    renderSalesDesk: () => {}
  };
  vm.createContext(context);
  vm.runInContext(section("async function saveOrderBookInBackground(payload)", "function openOrderBookForm(orderId"), context);
  const saving = context.saveOrderBookInBackground(payload);
  assert.equal(notices[0][1], "saving");
  assert.equal(context.salesCrmState.orderBook.length, 0);
  assert.equal(context.pendingOrderBookSaves.get(payload.id), payload);
  resolveSave({ savedItem: { ...payload, createNew: false }, savedItemId: payload.id, savedOrderNo: payload.orderNo, nextOrderBookNo: "CZ26-0002" });
  await saving;
  assert.equal(notices.at(-1)[1], "saved");
  assert.equal(context.salesCrmState.orderBook[0].id, payload.id);
  assert.equal(context.pendingOrderBookSaves.size, 0);
});

test("failed Order Book save keeps its draft for Retry", async () => {
  const notices = [];
  const reopened = [];
  const payload = { id: "order-2", orderNo: "CZ26-0002", customer: "Customer", createNew: true };
  const context = {
    pendingOrderBookSaves: new Map(), currentUser: { id: "user-1" },
    showOrderBookSaveNotice: (...args) => notices.push(args),
    api: async path => {
      if (path === "/api/sales-crm") return { orderBook: [] };
      throw new Error("Save failed");
    },
    showSalesDesk: () => {}, openOrderBookForm: (...args) => reopened.push(args)
  };
  vm.createContext(context);
  vm.runInContext(section("async function saveOrderBookInBackground(payload)", "function openOrderBookForm(orderId"), context);
  await context.saveOrderBookInBackground(payload);
  assert.equal(notices.at(-1)[1], "failed");
  notices.at(-1)[3]();
  assert.equal(reopened[0][0], payload.id);
  assert.equal(reopened[0][1], payload);
});
