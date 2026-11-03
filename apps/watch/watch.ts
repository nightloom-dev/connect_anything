import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { alertText, decide, lineOf, parseCommand, percent, type Position, type Watch } from './rules.ts';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('Set TELEGRAM_BOT_TOKEN in apps/watch/.env or the environment.');
// Positions are read through the web app, so the watcher needs no RPC or Kamino SDK of its own.
const app = (process.env.APP_URL ?? 'http://localhost:5180').replace(/\/$/, '');
const file = process.env.WATCH_FILE ?? new URL('data/watches.json', import.meta.url).pathname;
const every = Number(process.env.WATCH_EVERY_S ?? 60) * 1000;

const HELP = [
  '/watch <wallet> - ring when a Kamino position of this wallet gets 10 points from liquidation, with a link that repays it from Base',
  '/watch <wallet> <LTV %> - ring at that LTV instead',
  '/unwatch <wallet>',
  '/list',
].join('\n');

let watches: Watch[] = [];
try {
  watches = JSON.parse(readFileSync(file, 'utf8'));
} catch {
  // nothing watched yet
}
const save = () => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(watches, null, 2));
};

async function bot(method: string, body: object) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
}
const say = (chat: number, text: string) => bot('sendMessage', { chat_id: chat, text, link_preview_options: { is_disabled: true } });

async function positions(wallet: string): Promise<Position[]> {
  const response = await fetch(`${app}/api/kamino/${encodeURIComponent(wallet)}`);
  if (!response.ok) throw new Error(`reading the positions answered ${response.status}`);
  return (await response.json()).obligations;
}

async function check(watch: Watch) {
  for (const position of await positions(watch.wallet)) {
    const verdict = decide(watch, position);
    if (verdict === 'alert') {
      await say(watch.chat, alertText(position, lineOf(watch, position), app, watch.wallet));
      watch.alerted.push(position.address);
    }
    if (verdict === 'rearm') watch.alerted = watch.alerted.filter(address => address !== position.address);
    if (verdict) save();
  }
}

async function handle(chat: number, text: string) {
  const command = parseCommand(text);
  if (!command) return;
  if (command.kind === 'help') return say(chat, HELP);
  if (command.kind === 'error') return say(chat, command.text);
  if (command.kind === 'list') {
    const mine = watches.filter(watch => watch.chat === chat);
    const lines = mine.map(({ wallet, line }) => `${wallet}: ${line === null ? '10 points under liquidation' : percent(line)}`);
    return say(chat, lines.length ? lines.join('\n') : `Nothing watched.\n\n${HELP}`);
  }
  watches = watches.filter(watch => !(watch.chat === chat && watch.wallet === command.wallet));
  if (command.kind === 'unwatch') {
    save();
    return say(chat, `Stopped watching ${command.wallet}.`);
  }
  const found = await positions(command.wallet);
  const watch: Watch = { chat, wallet: command.wallet, line: command.line, alerted: [] };
  watches.push(watch);
  save();
  const now = found.map(position => `LTV ${percent(position.ltv)}, rings at ${percent(lineOf(watch, position))}, liquidated at ${percent(position.liquidationLtv)}`);
  await say(chat, now.length ? `Watching. Checked every ${every / 1000} s.\n${now.join('\n')}` : 'Watching, though this wallet has no open position on Kamino yet.');
  await check(watch);
}

async function listen() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await bot('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] });
      for (const { update_id, message } of updates) {
        offset = update_id + 1;
        if (message?.text) await handle(message.chat.id, message.text).catch(error => say(message.chat.id, `Could not do that: ${error.message}`).catch(() => {}));
      }
    } catch (error) {
      console.error(error);
      await sleep(5000);
    }
  }
}

async function patrol() {
  for (;;) {
    for (const watch of [...watches]) await check(watch).catch(error => console.error(watch.wallet, error.message));
    await sleep(every);
  }
}

listen();
patrol();
