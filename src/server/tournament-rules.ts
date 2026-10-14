import {randomInt,randomUUID} from 'node:crypto';
import {z} from 'zod';
export const leagueRules=z.object({winPoints:z.number().int().min(0).max(1000),drawPoints:z.number().int().min(0).max(1000),lossPoints:z.number().int().min(0).max(1000),allowDraws:z.boolean(),tiebreakers:z.array(z.enum(['WINS','SCORE_DIFFERENCE','SCORED'])).max(3).refine(v=>new Set(v).size===v.length,'Choose each tiebreaker once.')}).strict();
export type LeagueRules=z.infer<typeof leagueRules>;
export type DrawFixture={id:string;round:number;slot:number;homeRosterId:string|null;awayRosterId:string|null;winnerRosterId:string|null;status:'SCHEDULED'|'BYE';nextFixtureId:string|null;nextSide:'HOME'|'AWAY'|null};
export function shuffled<T>(items:T[]){const result=[...items];for(let i=result.length-1;i>0;i--){const j=randomInt(i+1);[result[i],result[j]]=[result[j],result[i]];}return result;}
export function buildDraw(format:'ROUND_ROBIN'|'KNOCKOUT',rosters:string[]):DrawFixture[]{
 if(rosters.length<2||rosters.length>32||new Set(rosters).size!==rosters.length)throw new Error('Draw requires 2–32 distinct entries.');
 const create=(round:number,slot:number,homeRosterId:string|null=null,awayRosterId:string|null=null):DrawFixture=>({id:randomUUID(),round,slot,homeRosterId,awayRosterId,winnerRosterId:null,status:'SCHEDULED',nextFixtureId:null,nextSide:null});
 if(format==='ROUND_ROBIN'){
  const ring:(string|null)[]=[...rosters];if(ring.length%2)ring.push(null);const matches:DrawFixture[]=[];
  for(let round=1;round<ring.length;round++){let slot=0;for(let i=0;i<ring.length/2;i++){let home=ring[i],away=ring[ring.length-1-i];if(home&&away){if(round%2===0)[home,away]=[away,home];matches.push(create(round,++slot,home,away));}}ring.splice(1,0,ring.pop()!);}return matches;
 }
 const size=2**Math.ceil(Math.log2(rosters.length)),rounds:DrawFixture[][]=[];
 for(let count=size/2,round=1;count>=1;count/=2,round++)rounds.push(Array.from({length:count},(_,i)=>create(round,i+1)));
 for(let r=0;r<rounds.length-1;r++)for(let i=0;i<rounds[r].length;i++){rounds[r][i].nextFixtureId=rounds[r+1][Math.floor(i/2)].id;rounds[r][i].nextSide=i%2?'AWAY':'HOME';}
 const first=rounds[0];for(let i=0;i<first.length;i++){const match=first[i];match.homeRosterId=rosters[i];match.awayRosterId=rosters[first.length+i]??null;if(!match.awayRosterId){match.status='BYE';match.winnerRosterId=match.homeRosterId;const next=rounds[1]?.find(f=>f.id===match.nextFixtureId);if(next){if(match.nextSide==='HOME')next.homeRosterId=match.homeRosterId;else next.awayRosterId=match.homeRosterId;}}}
 return rounds.flat();
}
export function standings(entries:{rosterId:string;teamName:string}[],fixtures:{status:string;homeRosterId:string|null;awayRosterId:string|null;homeScore:number|null;awayScore:number|null}[],rules:LeagueRules){
 const rows=entries.map(e=>({...e,played:0,wins:0,draws:0,losses:0,scored:0,conceded:0,difference:0,points:0}));const map=new Map(rows.map(r=>[r.rosterId,r]));
 for(const f of fixtures){if(f.status!=='FINAL'||!f.homeRosterId||!f.awayRosterId||f.homeScore===null||f.awayScore===null)continue;const home=map.get(f.homeRosterId)!,away=map.get(f.awayRosterId)!;home.played++;away.played++;home.scored+=f.homeScore;home.conceded+=f.awayScore;away.scored+=f.awayScore;away.conceded+=f.homeScore;
  if(f.homeScore===f.awayScore){home.draws++;away.draws++;home.points+=rules.drawPoints;away.points+=rules.drawPoints;}else{const winner=f.homeScore>f.awayScore?home:away,loser=winner===home?away:home;winner.wins++;loser.losses++;winner.points+=rules.winPoints;loser.points+=rules.lossPoints;}
 }
 for(const r of rows)r.difference=r.scored-r.conceded;
 const compare=(a:typeof rows[number],b:typeof rows[number])=>{let delta=b.points-a.points;if(delta)return delta;for(const key of rules.tiebreakers){delta=key==='WINS'?b.wins-a.wins:key==='SCORE_DIFFERENCE'?b.difference-a.difference:b.scored-a.scored;if(delta)return delta;}return 0;};
 rows.sort((a,b)=>compare(a,b)||a.teamName.localeCompare(b.teamName));return rows.map((r,i)=>({...r,rank:i===0?1:compare(r,rows[i-1])===0?rows.slice(0,i).findIndex(previous=>compare(r,previous)===0)+1:i+1,tied:rows.some(other=>other!==r&&compare(r,other)===0)}));
}
