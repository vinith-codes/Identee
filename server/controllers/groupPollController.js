// controllers/groupPollController.js — the group link (11 Nov 2026, Assistant round 8; models/groupPollModel.js)
//
//   POST /api/groups                 (login)   make a link: { title, garment, picture, options, sizes, askNumber }
//   GET  /api/groups/mine            (login)   the owner's links, newest first
//   GET  /api/groups/:token          (public)  what a friend sees: picture, choices, sizes, the vote counts. No names.
//   POST /api/groups/:token/join     (public)  a friend's answer: { name, size, number, vote, key? }
//   GET  /api/groups/:token/entries  (owner)   every answer, for "Fill my tees"
//   PUT  /api/groups/:token/close    (owner)   { closed: true | false }
import crypto from "crypto";
import asyncHandler from "express-async-handler";
import GroupPoll from "../models/groupPollModel.js";
import { cleanEntry, cleanGroup, MAX_ENTRIES, publicView } from "../services/groupPoll.js";
import { isOurUpload } from "./aiController.js";

const MAX_OPEN = 20; // links one customer may have open at a time
const newKey = () => crypto.randomBytes(9).toString("base64url");
const fail = (res, status, message) => {
  res.status(status);
  throw new Error(message);
};

export const createGroup = asyncHandler(async (req, res) => {
  const open = await GroupPoll.countDocuments({ owner: req.user._id, closedAt: null });
  if (open >= MAX_OPEN) fail(res, 400, "You already have many group links open. Close one first.");
  const poll = await GroupPoll.create({ owner: req.user._id, token: newKey(), ...cleanGroup(req.body, { ourUpload: isOurUpload }) });
  res.status(201).json(publicView(poll));
});

export const myGroups = asyncHandler(async (req, res) => {
  const polls = await GroupPoll.find({ owner: req.user._id }).sort({ createdAt: -1 }).limit(10);
  res.json({ groups: polls.map((p) => ({ ...publicView(p), createdAt: p.createdAt })) });
});

const byToken = async (req, res) => {
  const token = String(req.params.token || "");
  const poll = /^[\w-]{8,24}$/.test(token) ? await GroupPoll.findOne({ token }) : null;
  if (!poll) fail(res, 404, "This link doesn’t work any more.");
  return poll;
};
// someone else's link looks like no link at all
const ownPoll = async (req, res) => {
  const poll = await byToken(req, res);
  if (String(poll.owner) !== String(req.user._id)) fail(res, 404, "This link doesn’t work any more.");
  return poll;
};

export const getGroup = asyncHandler(async (req, res) => {
  res.json(publicView(await byToken(req, res)));
});

export const joinGroup = asyncHandler(async (req, res) => {
  const poll = await byToken(req, res);
  if (poll.closedAt) fail(res, 400, "This link is closed. Ask the person who sent it.");
  const { entry, error } = cleanEntry(req.body, poll);
  if (error) fail(res, 400, error);
  const key = String(req.body?.key || "");
  const mine = key ? poll.entries.find((e) => e.key === key) : null;
  if (mine) Object.assign(mine, entry);
  else {
    if (poll.entries.length >= MAX_ENTRIES) fail(res, 400, "This group is full. Ask the person who sent the link.");
    poll.entries.push({ ...entry, key: newKey() });
  }
  await poll.save();
  res.status(mine ? 200 : 201).json({ key: mine ? mine.key : poll.entries[poll.entries.length - 1].key, entry, ...publicView(poll) });
});

export const groupEntries = asyncHandler(async (req, res) => {
  const poll = await ownPoll(req, res);
  res.json({ ...publicView(poll), entries: poll.entries.map((e) => ({ name: e.name, size: e.size, number: e.number, vote: e.vote })) });
});

export const closeGroup = asyncHandler(async (req, res) => {
  const poll = await ownPoll(req, res);
  poll.closedAt = req.body?.closed === false ? null : new Date();
  await poll.save();
  res.json(publicView(poll));
});
