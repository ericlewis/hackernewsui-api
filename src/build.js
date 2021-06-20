/* eslint strict:"off" */
"use strict";

const fastify = require("fastify");
const { decode } = require("html-entities");
const fetch = require("undici-fetch");
const firebase = require("firebase");
const any = require("promise.any");

const { NodeHtmlMarkdown } = require("node-html-markdown");

const nhm = new NodeHtmlMarkdown();

const firebaseConfig = {
  databaseURL: "https://hacker-news.firebaseio.com/"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

async function fetchItemURL(id) {
  const url = `https://hacker-news.firebaseio.com/v0/item/${id}`;
  const response = await fetch(url);
  return response.json();
}

async function fetchItemFirebase(id) {
  const response = await database
    .ref(`v0/item/${id.replace(".json", "")}`)
    .get();
  return response.val();
}

function fetchItem(id) {
  return any([fetchItemFirebase(id), fetchItemURL(id)]);
}

async function fetchIdsURL(endpoint) {
  const url = `https://hacker-news.firebaseio.com/v0/${endpoint}`;
  const response = await fetch(url);
  return response.json();
}

async function fetchIdsFirebase(endpoint) {
  const response = await database
    .ref(`v0/${endpoint.replace(".json", "")}`)
    .get();
  return response.val();
}

function fetchIds(endpoint) {
  return any([fetchIdsURL(endpoint), fetchIdsFirebase(endpoint)]);
}

function build(opts) {
  const app = fastify(opts);

  app.get("/v0/item/:id", async (req, _reply) => {
    const item = await fetchItem(req.params.id);

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

  app.get("/v0/:endpoint", async (req, _reply) => {
    const ids = await fetchIds(req.params.endpoint);
    return Promise.all(ids.map((id) => fetchItem(`${id}.json`)));
  });

  return app;
}

module.exports = {
  build
};
