import type { Snapshot } from './contract';
import fixture from './demo-fixture.json';

export function emptySnapshot(revision=0): Snapshot {
  return {schemaVersion:1,revision,mode:'live',sessions:[],requests:[],history:[],connections:[
    {provider:'claude',status:'unverified',detail:'Bağlantı henüz doğrulanmadı'},
    {provider:'codex',status:'unverified',detail:'Bağlantı henüz doğrulanmadı'}]};
}
export function createDemoSnapshot(revision=1,now=Date.now()): Snapshot {
  const snapshot=structuredClone(fixture) as Snapshot;
  snapshot.revision=revision;
  for(const s of snapshot.sessions) s.lastActivity=now+s.lastActivity;
  // As the app's providers say (providers.rs): a Codex chat opens by its id, a Claude chat by its own link.
  for(const s of snapshot.sessions) if(!s.open&&(s.key.provider==='codex'||s.link)) s.open='exact';
  for(const r of snapshot.requests) r.expiresAt=now+r.expiresAt;
  for(const h of snapshot.history) h.at=now+h.at;
  return snapshot;
}
export function acceptSnapshot(current:Snapshot,incoming:Snapshot):Snapshot {
  return incoming.schemaVersion===1 && incoming.revision>=current.revision ? incoming : current;
}
