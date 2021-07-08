/* eslint strict:"off" */
"use strict";

const fastify = require("fastify");
const { decode } = require("html-entities");
const fetch = require("undici-fetch");
const { NodeHtmlMarkdown } = require("node-html-markdown");
const HTMLParser = require("node-html-parser");

const nhm = new NodeHtmlMarkdown();

function parse(text) {
  if (text) {
    return nhm.translate(decode(text));
  }

  return undefined;
}

async function fetchItem(id, includeKids = true) {
  const url = `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
  const response = await fetch(url);
  const json = await response.json();
  const text = parse(json?.text) || undefined;

  return {
    ...json,
    kids: includeKids ? json.kids : undefined,
    text
  };
}

async function fetchUser(id) {
  const url = `https://hacker-news.firebaseio.com/v0/user/${id}.json`;
  const response = await fetch(url);
  const json = await response.json();

  const about = parse(json?.about) || undefined;

  return {
    ...json,
    about
  };
}

async function fetchIds(endpoint) {
  const url = `https://hacker-news.firebaseio.com/v0/${endpoint}.json`;
  const response = await fetch(url);
  return response.json();
}

async function fetchFeed(endpoint) {
  const ids = await fetchIds(endpoint);
  const result = await Promise.all(ids.map((id) => fetchItem(id, false)));
  return result.filter((o) => o.title);
}

async function recursiveComments(item) {
  let kids;
  if (item.kids) {
    kids = await Promise.all(
      item.kids.map(async (id) => {
        const item = await fetchItem(id);
        const comments = await recursiveComments(item);

        return {
          ...item,
          comments,
          kids: undefined
        };
      })
    );
  }

  return kids;
}

function convertEndpointToWebEndpoint(endpoint) {
  switch (endpoint) {
    case "topstories":
      return "news";
    case "newstories":
      return "newest";
    case "jobstories":
      return "jobs";
    case "showstories":
      return "show";
    case "askstories":
      return "ask";
    case "beststories":
      return "best";
    default:
      return "news";
  }
}

async function parseURL(endpoint) {
  const response = await fetch(`https://news.ycombinator.com/${endpoint}`);
  const responseText = await response.text();
  const root = HTMLParser.parse(responseText);

  return root.querySelectorAll(".athing").map((t) => {
    const titleSelector = t.querySelector(".storylink");
    const sibling = t.nextElementSibling;
    const chrome = sibling.querySelectorAll(".subtext > a");

    const id = parseInt(t.getAttribute("id"));
    const title = titleSelector.rawText;
    const score = parseInt(sibling.querySelector(".score")?.rawText);
    const by = sibling.querySelector(".hnuser")?.rawText;
    const time =
      Date.parse(sibling.querySelector(".age")?.getAttribute("title")) / 1000;
    const descendants = parseInt(
      chrome.map((o) => o.lastChild.toString()).pop()
    );
    const url = titleSelector.getAttribute("href");
    const type = chrome.length > 1 ? "story" : "job";

    return {
      id,
      score,
      by,
      time,
      title,
      descendants,
      url,
      type
    };
  });
}

function build(opts) {
  const app = fastify(opts);

  app.get("/v0/item/:id", async (req, _reply) => {
    const item = await fetchItem(req.params.id);

    if (item.id === undefined || item.id === null) {
      return;
    }

    const result = {
      ...item,
      url: item.url ? encodeURI(item.url) : undefined
    };

    return result;
  });

  app.get("/v1/item/:id", async (req, _reply) => {
    const item = await fetchItem(req.params.id);
    const comments = await recursiveComments(item);

    const result = {
      ...item,
      comments,
      kids: undefined,
      url: item.url ? encodeURI(item.url) : undefined
    };

    return result;
  });

  app.get("/v0/user/:id", (req, _reply) => {
    return fetchUser(req.params.id);
  });

  app.get("/v1/user/:id", async (req, _reply) => {
    const item = await fetchUser(req.params.id);
    const submitted = await Promise.all(
      item.submitted.map((id) => fetchItem(id))
    );

    const result = {
      ...item,
      submitted
    };

    return result;
  });

  app.get("/v0/:endpoint", async (req, _reply) => {
    const ids = await fetchIds(req.params.endpoint);
    const result = await Promise.all(ids.map((id) => fetchItem(id, false)));
    return result.filter((o) => o.title);
  });

  app.get("/v1/:endpoint", async (req, _reply) => {
    const endpoint = req.params.endpoint;

    // New/Job stories uses a different pagination mechanism, therefore we must fallback
    if (endpoint === "newstories" || endpoint === "jobstories") {
      return fetchFeed(endpoint);
    }

    try {
      const result = await Promise.all([
        parseURL(convertEndpointToWebEndpoint(endpoint)),
        parseURL(`${convertEndpointToWebEndpoint(endpoint)}?p=2`),
        parseURL(`${convertEndpointToWebEndpoint(endpoint)}?p=3`),
        parseURL(`${convertEndpointToWebEndpoint(endpoint)}?p=4`)
      ]);
      return result.flat();
    } catch (_error) {
      return fetchFeed(endpoint);
    }
  });

  app.get("/", (_req, _reply) => {
    return { message: "wat?" };
  });

  return app;
}

module.exports = {
  build
};
