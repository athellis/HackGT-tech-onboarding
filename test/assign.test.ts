import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { collections, seed, startDb, stopDb } from "../src/db.js";

let server: Server;
let base: string;

before(async () => {
  await startDb();
  server = createApp().listen(0);
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.close();
  await stopDb();
});

beforeEach(seed);

const assign = (judgeId: string) => fetch(`${base}/assign/${judgeId}`, { method: "POST" });
const complete = (id: string) => fetch(`${base}/assignments/${id}/complete`, { method: "POST" });

describe("assign", () => {
  it("gives a judge a QUEUED project", async () => {
    const res = await assign("j1");
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.judgeId, "j1");
    assert.equal(body.status, "QUEUED");
  });

  it("returns 409 while the judge still has an active project", async () => {
    assert.equal((await assign("j1")).status, 201);
    assert.equal((await assign("j1")).status, 409);
  });

  it("does not give a judge the same project twice", async () => {
    const first = await (await assign("j1")).json();
    await complete(first._id);
    const second = await (await assign("j1")).json();
    assert.notEqual(second.projectId, first.projectId);
  });

  it("prefers the project with the fewest completed judgments", async () => {
    for (let i = 1; i <= 9; i++) {
      await collections().assignments.insertOne({
        judgeId: "j2",
        projectId: `p${i}`,
        status: "COMPLETED",
        createdAt: new Date(),
      } as never);
    }
    const body = await (await assign("j1")).json();
    assert.equal(body.projectId, "p10");
  });


  it("does not assign a project that another judge has QUEUED", async () => {
    const first = await (await assign("j1")).json();
    const second = await (await assign("j2")).json();

    assert.notEqual(first.projectId, second.projectId);
  });

  it("returns 404 when no projects are available", async () => {
    //mark every project as completed by j1
    for (let i = 1; i <= 10; i++) {
      await collections().assignments.insertOne({
        judgeId: "j1",
        projectId: `p${i}`,
        status: "COMPLETED",
        createdAt: new Date(),
      } as never);
    }

    const res = await assign("j1");
    assert.equal(res.status, 404);

    const body = await res.json();
    assert.equal(body.error, "no projects available");
  });

  it("randomly selects among projects tied for fewest completions", async () => {
    //give p1-p8 one completed assignment each
    for (let i = 1; i <= 8; i++) {
      await collections().assignments.insertOne({
        judgeId: "j2",
        projectId: `p${i}`,
        status: "COMPLETED",
        createdAt: new Date(),
      } as never);
    }

    // p9 and p10 have zero completions, so both are candidates
    const res = await assign("j1");
    assert.equal(res.status, 201);

    const body = await res.json();
    assert.ok(body.projectId === "p9" || body.projectId === "p10");
  });


});
