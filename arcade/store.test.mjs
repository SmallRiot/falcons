import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {openStore,hash} from './store.mjs';
import {createHmac} from 'node:crypto';

test('goal credit, purchases, commitment, replay and persistence',()=>{
  const dir=mkdtempSync(tmpdir()+'/falcons-arcade-');
  let store=openStore(dir);
  try {
    const commitment=store.state().commitment, nonce='ab'.repeat(16);
    assert.throws(()=>store.drop(commitment,nonce));
    for(let i=0;i<501;i++) store.goal('goal-'+i);
    assert.equal(store.goal('goal-0').balance,501);
    const p1=store.buy('hockey-tape');
    assert.equal(p1.item.id,'hockey-tape');
    assert.throws(()=>store.buy('hockey-tape')); // повтор можно, но очков уже нет
    assert.equal(store.state().balance,1);
    assert.equal(store.state().bought['hockey-tape'],1);
    assert.throws(()=>store.buy('hockey-stick-150'));
    for(let i=501;i<801;i++) store.goal('goal-'+i);
    assert.throws(()=>store.buy('nick-color'), /вариант/);
    assert.throws(()=>store.buy('nick-color','#000000'), /вариант/);
    assert.equal(store.buy('nick-color','#3ddc84').option,'#3ddc84');
    store.buy('nick-emoji','🦅'); store.buy('nick-emoji','🔥'); // повторная покупка
    assert.equal(store.state().bought['nick-emoji'],2);
    assert.equal(store.stats().purchases.length,4);
    assert.equal(store.stats().goals,801);
    store.refund(60);
    const before=1+300-30-30-30+60;
    assert.equal(store.state().balance,before);
    const receipt=store.drop(commitment,nonce);
    assert.equal(hash(receipt.seed),commitment);
    assert.equal(receipt.pucks[0].bits,createHmac('sha256',receipt.seed).update(nonce+':0').digest().readUInt16BE(0).toString(2).padStart(16,'0'));
    assert.deepEqual(store.drop(commitment,nonce),receipt);
    assert.throws(()=>store.drop(commitment,'ff'.repeat(16)));
    store.close();store=openStore(dir);
    assert.equal(store.state().balance,before-1+receipt.payout);
    assert.deepEqual([...store.state().owned].sort(),['hockey-tape','nick-color','nick-emoji']);
    assert.equal(store.stats().drops,1);
    assert.notEqual(store.state().commitment,commitment);
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});

test('stake scales the payout and cannot change on replay', () => {
  const dir = mkdtempSync(tmpdir()+'/falcons-stake-');
  const store = openStore(dir);
  try {
    for (let i=0; i<8; i++) store.goal('goal-'+i);
    const { commitment, payouts } = store.state();
    const nonce = 'dc'.repeat(16);
    for (const stake of [0, -1, 1.5, 9, null, '4']) assert.throws(() => store.drop(commitment, nonce, stake));
    const receipt = store.drop(commitment, nonce, 5);
    assert.equal(receipt.pucks.length,5);
    let totalUnits = 0;
    for (const [index, puck] of receipt.pucks.entries()) {
      const expected = createHmac('sha256',receipt.seed).update(nonce+':'+index).digest().readUInt16BE(0).toString(2).padStart(16,'0');
      assert.equal(puck.bits,expected);
      assert.equal(puck.slot,[...expected].filter(bit=>bit==='1').length);
      assert.equal(puck.multiplier,payouts[puck.slot]);
      totalUnits += Math.round(puck.multiplier*5);
    }
    assert.equal(receipt.payout,totalUnits/5);
    assert.deepEqual(store.drop(commitment, nonce, 5), receipt);
    assert.throws(() => store.drop(commitment, nonce, 2));
    assert.equal(store.state().balance, 3 + receipt.payout);
  } finally { store.close(); rmSync(dir, {recursive:true, force:true}); }
});

test('welcome bonus stays separate, survives reopening and is collected only once',()=>{
  const dir=mkdtempSync(tmpdir()+'/falcons-bonus-');
  let store=openStore(dir);
  try {
    store.activate(); store.activate();
    assert.equal(store.state().bonus.balance,100);
    assert.throws(()=>store.buy('hockey-tape'));
    assert.throws(()=>store.collect());
    const {commitment}=store.state(), nonce='01'.repeat(16);
    const receipt=store.drop(commitment,nonce,10,'bonus');
    assert.deepEqual(store.drop(commitment,nonce,10,'bonus'),receipt);
    assert.throws(()=>store.drop(commitment,nonce,10,'wallet'));
    assert.equal(store.state().bonus.played,10);
    assert.equal(store.state().balance,0);
    store.close();
    const db=new DatabaseSync(dir+'/game.sqlite');
    db.exec('UPDATE welcome SET played=499,balance=505');db.close();
    store=openStore(dir);
    assert.throws(()=>store.drop(store.state().commitment,nonce,2,'bonus'));
    store.drop(store.state().commitment,nonce,1,'bonus');
    const ready=store.state().bonus;
    assert.equal(ready.status,'ready');
    store.collect();store.collect();store.activate();
    assert.equal(store.state().balance,ready.balance);
    assert.equal(store.state().bonus.status,'collected');
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});

test('week term and owner grants', () => {
  const dir = mkdtempSync(tmpdir()+'/falcons-week-');
  const store = openStore(dir);
  try {
    assert.throws(() => store.grant(-1), /нет/);
    assert.equal(store.grant(25), 25);
    const w = store.buy('nick-fire', null, null, 'week');
    assert.equal(w.item.price, 10);
    assert.equal(w.item.days, 7);
    assert.match(w.item.name, /на неделю/);
    assert.throws(() => store.buy('shout-out', null, null, 'week'), /неделю/);
    assert.throws(() => store.buy('nick-fire', null, null, 'year'), /срок/);
    assert.equal(store.buy('frame-month', 'torch', 12, 'week').item.price, 12);
    assert.equal(store.state().balance, 3);
    assert.equal(store.grant(-3), 0);
  } finally { store.close(); rmSync(dir, {recursive:true, force:true}); }
});
