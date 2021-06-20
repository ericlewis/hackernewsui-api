/* eslint strict:"off" */
"use strict";

const fastify = require("fastify");
const { decode } = require("html-entities");
const fetch = require("undici-fetch");
const { NodeHtmlMarkdown } = require("node-html-markdown");

const nhm = new NodeHtmlMarkdown();

async function fetchItemURL(id) {
  const url = `https://hacker-news.firebaseio.com/v0/item/${id}`;
  const response = await fetch(url);
  return response.json();
}

async function fetchIdsURL(endpoint) {
  const url = `https://hacker-news.firebaseio.com/v0/${endpoint}`;
  const response = await fetch(url);
  return response.json();
}

function parseText(item) {
  if (item.text) {
    return nhm.translate(decode(item.text));
  }

  return undefined;
}

async function recursiveComments(item) {
  let kids;
  if (item.kids) {
    kids = await Promise.all(
      item.kids.map(async (id) => {
        const item = await fetchItemURL(`${id}.json`);
        const kids = await recursiveComments(item);

        const text = parseText(item);

        return {
          ...item,
          kids,
          text
        };
      })
    );
  }

  return kids;
}

function build(opts) {
  const app = fastify(opts);

  app.get("/v0/item/:id", async (req, _reply) => {
    const item = await fetchItemURL(req.params.id);

    if (item.id === undefined || item.id === null) {
      return;
    }

    const text =
      item.text !== null ? nhm.translate(decode(item.text)) : undefined;

    const result = {
      ...item,
      text
    };

    return result;
  });

  app.get("/v1/item/:id", async (req, _reply) => {
    const item = await fetchItemURL(req.params.id);
    const text = parseText(item);

    const kids = await recursiveComments(item);

    const result = {
      ...item,
      kids,
      text
    };

    return result;
  });

  app.get("/v0/:endpoint", async (req, _reply) => {
    const ids = await fetchIdsURL(req.params.endpoint);
    return Promise.all(ids.map((id) => fetchItemURL(`${id}.json`)));
  });

  app.get("/", (_req, _reply) => {
    return { message: "whatchu lookin at willis?" };
  });

  return app;
}

module.exports = {
  build
};
