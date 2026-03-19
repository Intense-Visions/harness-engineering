// This file intentionally contains security issues for testing

const API_KEY = 'sk_live_abc123secretkey456def';

export function query(userInput: string) {
  const sql = `SELECT * FROM users WHERE name = '${userInput}'`;
  return sql;
}
