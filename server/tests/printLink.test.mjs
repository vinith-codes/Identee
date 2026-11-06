// The print team's download link must carry the public backend address, never the panel's inside one (6 Nov 2026:
// a link to localhost:7854 reached the print team).
import test from "node:test";
import assert from "node:assert/strict";
import { publicBase } from "../controllers/printFileController.js";

const req = (headers, protocol = "http") => ({ protocol, get: (h) => headers[h.toLowerCase()] });

test("publicBase uses the proxy's forwarded host", () => {
  assert.equal(publicBase(req({ host: "localhost:7854", "x-forwarded-host": "backend.identee.co.in", "x-forwarded-proto": "https" })), "https://backend.identee.co.in");
});

test("publicBase keeps a real Host header", () => {
  assert.equal(publicBase(req({ host: "backend.identee.co.in", "x-forwarded-proto": "https" })), "https://backend.identee.co.in");
});

test("publicBase never gives an inside address in production", () => {
  const was = [process.env.NODE_ENV, process.env.PUBLIC_BACKEND_URL];
  try {
    process.env.NODE_ENV = "production";
    delete process.env.PUBLIC_BACKEND_URL;
    assert.equal(publicBase(req({ host: "localhost:7854" })), "https://backend.identee.co.in");
    assert.equal(publicBase(req({ host: "127.0.0.1:7854", "x-forwarded-host": "localhost:7854" })), "https://backend.identee.co.in");
    process.env.PUBLIC_BACKEND_URL = "https://api.example.test/";
    assert.equal(publicBase(req({ host: "localhost:7854" })), "https://api.example.test");
  } finally {
    process.env.NODE_ENV = was[0] ?? "";
    if (was[0] === undefined) delete process.env.NODE_ENV;
    if (was[1] === undefined) delete process.env.PUBLIC_BACKEND_URL;
    else process.env.PUBLIC_BACKEND_URL = was[1];
  }
});

test("publicBase keeps localhost on the laptop", () => {
  const was = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    assert.equal(publicBase(req({ host: "localhost:5099" })), "http://localhost:5099");
  } finally {
    if (was === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = was;
  }
});
