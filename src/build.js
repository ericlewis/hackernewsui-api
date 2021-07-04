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

async function fetchUser(id) {
  const url = `https://hacker-news.firebaseio.com/v0/user/${id}`;
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

function parseAbout(item) {
  if (item.about) {
    return nhm.translate(decode(item.about));
  }

  return undefined;
}

async function recursiveComments(item) {
  let kids;
  if (item.kids) {
    kids = await Promise.all(
      item.kids.map(async (id) => {
        const item = await fetchItemURL(`${id}.json`);
        const comments = await recursiveComments(item);

        const text = parseText(item);

        return {
          ...item,
          comments,
          kids: undefined,
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

    const comments = await recursiveComments(item);

    const result = {
      ...item,
      comments,
      kids: undefined,
      text
    };

    return result;
  });

  app.get("/v0/user/:id", async (req, _reply) => {
    const item = await fetchUser(req.params.id);
    return item;
  });

  app.get("/v1/user/:id", async (req, _reply) => {
    const item = await fetchUser(req.params.id);
    const about = parseAbout(item);
    const submitted = await Promise.all(item.submitted.map((id) => fetchItemURL(`${id}.json`)));

    const result = {
      ...item,
      about,
      submitted
    };

    return result;
  });

  app.get("/v0/:endpoint", async (req, _reply) => {
    const ids = await fetchIdsURL(req.params.endpoint);
    const result = await Promise.all(ids.map((id) => fetchItemURL(`${id}.json`)));
    return result.filter(o => o);
  });

  app.get("/", (_req, _reply) => {
    return { message: "whatchu lookin at willis?" };
  });

  return app;
}

module.exports = {
  build
};
