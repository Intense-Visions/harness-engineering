const express = require('express');

class Router {
  constructor() {
    this.routes = [];
  }

  addRoute(method, path, handler) {
    this.routes.push({ method, path, handler });
  }

  get(path, handler) {
    this.addRoute('GET', path, handler);
  }
}

function createRouter() {
  return new Router();
}

module.exports = { Router, createRouter };
