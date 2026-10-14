'use client';
import {EligibilityDetails,EligibilityHistory,type Declaration} from './eligibility-details';
import { useCallback,useEffect,useState } from 'react';
type Member={participantKey:string;fullName:string;jerseyNumber:number|null;captain:boolean};
type Roster={currentEligibility?:Declaration|null;id:string;status:string;revision:number;reviewNote?:string|null;reviewedAt?:string|null;competition:{sportCode:string;minPlayers:number|null;maxPlayers:number|null;eligibilityEnabled?:boolean;eligibilityRevision?:number;eligibilityRequirements?:string|null;eligibilityEvidenceRequired?:boolean};members:Member[]};
type Team={ownershipRevision:number;id:string;teamName:string;rosters:Roster[]};
type Catalog={registrationOpen:boolean;event:{teamOptions:{id:string;name:string}[];competitions:{sportCode:string;minPlayers:number|null;maxPlayers:number|null}[]}};
async function api<T>(url:string,options?:RequestInit):Promise<T>{const response=await fetch(url,{...options,cache:'no-store',headers:{'content-type':'application/json',...options?.headers}});const body=await response.json();if(!response.ok)throw new Error(body.error?.message??'Please try again.');return body;}
export default function Registration(){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[email,setEmail]=useState<string|null>(null),[teams,setTeams]=useState<Team[]>([]);
 const [message,setMessage]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[signInAvailable,setSignInAvailable]=useState(false);
 const [option,setOption]=useState(''),[sports,setSports]=useState<string[]>([]),[name,setName]=useState(''),[phone,setPhone]=useState('');
 const refresh=useCallback(async()=>{
  setLoading(true);setMessage('');
  try{
   const [sessionResponse,catalogResponse]=await Promise.all([fetch('/api/auth/session',{cache:'no-store'}),fetch('/api/kala/catalog',{cache:'no-store'})]);
   const session=await sessionResponse.json(),catalogBody=await catalogResponse.json();
   setSignInAvailable(session.error?.code!=='AUTH_NOT_CONFIGURED');
   setEmail(sessionResponse.ok?session.email:null);
   if(!catalogResponse.ok){setCatalog(null);throw new Error(catalogBody.error?.message??'Registration is not available yet.');}
   setCatalog(catalogBody);
   if(sessionResponse.ok)setTeams((await api<{teams:Team[]}>('/api/kala/teams')).teams);else setTeams([]);
  }catch(error){setMessage(error instanceof Error?error.message:'Registration is not available yet.');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 async function create(event:React.FormEvent){event.preventDefault();setBusy(true);setMessage('');try{await api('/api/kala/teams',{method:'POST',body:JSON.stringify({teamOptionId:option,sportCodes:sports,representative:{name,phone}})});await refresh();}catch(error){setMessage(error instanceof Error?error.message:'Could not create team.');}finally{setBusy(false);}}
 async function logout(){setBusy(true);try{await api('/api/auth/logout',{method:'POST',body:'{}'});setTeams([]);setEmail(null);}catch(error){setMessage(error instanceof Error?error.message:'Could not sign out.');}finally{setBusy(false);}}
 if(loading)return <p role="status">Loading registration…</p>;
 const open=!!catalog?.registrationOpen;
 return <div className="registration-area">
  {message&&<p role="alert" className="notice">{message}</p>}
  {!open&&<p className="notice">Team registration is not open yet.</p>}
  {email?<div className="account"><span>Signed in as {email}</span><button className="secondary" onClick={logout} disabled={busy}>Sign out</button></div>:signInAvailable?<a className="button" href="/api/auth/login">{open?'Sign in to register':'Sign in to manage your team or save a profile'}</a>:null}
  {email&&open&&<form onSubmit={create} className="panel"><h2>Register your team</h2><div className="grid form-grid"><label>Representative name<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></label><label>Phone number<input required maxLength={24} value={phone} onChange={e=>setPhone(e.target.value)} type="tel" autoComplete="tel"/></label><label>University / team<select required value={option} onChange={e=>setOption(e.target.value)}><option value="">Choose your team</option>{catalog?.event.teamOptions.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div><fieldset><legend>Sports</legend>{catalog?.event.competitions.map(c=><label className="check" key={c.sportCode}><input type="checkbox" checked={sports.includes(c.sportCode)} onChange={e=>setSports(e.target.checked?[...sports,c.sportCode]:sports.filter(x=>x!==c.sportCode))}/>{c.sportCode}</label>)}</fieldset><button disabled={busy||!sports.length||!option}>{busy?'Saving…':'Create team & rosters'}</button><p className="muted">Creating a team saves a draft. Submit each completed roster below.</p></form>}
  {email&&<RepresentativeProfile email={email}/>}
  {teams.map(team=><section key={team.id} className="team"><h2>{team.teamName}</h2><AddSports key={`${team.id}-${team.ownershipRevision}`} team={team} competitions={catalog?.event.competitions??[]} open={open} refresh={refresh}/>{team.rosters.map(roster=><RosterEditor key={`${roster.id}-${roster.revision}`} roster={roster} open={open} refresh={refresh}/>)}</section>)}
  <button className="secondary" onClick={refresh} disabled={busy}>Reload registration</button>
 </div>;
}
function RosterEditor({roster,open,refresh}:{roster:Roster;open:boolean;refresh:()=>Promise<void>}){
 const [members,setMembers]=useState<Member[]>(roster.members),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [acceptedPolicy,setAcceptedPolicy]=useState<number|null>(null),[eligibilityResponse,setEligibilityResponse]=useState('');
 const policy=roster.competition;
 const eligibilityAccepted=acceptedPolicy!==null&&acceptedPolicy===policy.eligibilityRevision;
 useEffect(()=>{setAcceptedPolicy(null);setEligibilityResponse('');},[policy.eligibilityRevision,policy.eligibilityEnabled]);
 const canCorrect=roster.status==='DRAFT'||roster.status==='REJECTED';
 const editable=open&&canCorrect&&!busy;
 function edit(index:number,patch:Partial<Member>){setMembers(members.map((m,i)=>i===index?{...m,...patch}:m));setDirty(true);}
 async function action(submit:boolean){setBusy(true);setMessage('');try{await api(`/api/kala/rosters/${roster.id}${submit?'/submit':''}`,{method:submit?'POST':'PUT',body:JSON.stringify(submit?{revision:roster.revision,...(policy.eligibilityEnabled?{eligibility:{policyRevision:policy.eligibilityRevision,confirmed:true,response:eligibilityResponse}}:{})}:{revision:roster.revision,members})});await refresh();}catch(error){setMessage(error instanceof Error?error.message:'Could not save roster.');}finally{setBusy(false);}}
 const min=roster.competition.minPlayers??1,max=roster.competition.maxPlayers??100;
 return <article className="panel"><div className="roster-heading"><h3>{roster.competition.sportCode}</h3><span className="status">{roster.status}</span></div><p className="muted">{min}–{max} players · {members.length} added</p>{roster.status==='SUBMITTED'&&<p role="status">Roster submitted. Awaiting organizer review.</p>}{roster.status==='REJECTED'&&<p role="status">Update your players, save corrections, then resubmit for organizer review.</p>}{roster.reviewNote&&<p><strong>Organizer note:</strong> {roster.reviewNote}</p>}{message&&<p role="alert" className="notice">{message}</p>}
  <fieldset disabled={!editable}><legend className="sr-only">Players for {roster.competition.sportCode}</legend>{members.map((member,index)=><div className="player-row" key={member.participantKey}><label>Player {index+1}<input required maxLength={120} value={member.fullName} onChange={e=>edit(index,{fullName:e.target.value})}/></label><label>Jersey number<input type="number" min={0} max={999} value={member.jerseyNumber??''} onChange={e=>edit(index,{jerseyNumber:e.target.value===''?null:Number(e.target.value)})}/></label><label className="check"><input type="checkbox" checked={member.captain} onChange={e=>edit(index,{captain:e.target.checked})}/>Captain</label><button className="secondary" type="button" aria-label={`Remove player ${index+1}`} onClick={()=>{setMembers(members.filter((_,i)=>i!==index));setDirty(true);}}>Remove</button></div>)}</fieldset>
  {canCorrect&&policy.eligibilityEnabled&&<fieldset disabled={!editable||dirty}><legend>Eligibility · Version {policy.eligibilityRevision}</legend><p className="eligibility-copy">{policy.eligibilityRequirements}</p><label>Eligibility statement / reference{policy.eligibilityEvidenceRequired?' (required)':' (optional)'}<textarea maxLength={4000} minLength={policy.eligibilityEvidenceRequired?5:undefined} value={eligibilityResponse} onChange={e=>setEligibilityResponse(e.target.value)}/></label><label className="merch-consent"><input type="checkbox" checked={eligibilityAccepted} onChange={e=>setAcceptedPolicy(e.target.checked?(policy.eligibilityRevision??null):null)}/>I confirm every player in this saved roster meets the requirements above.</label></fieldset>}
  {roster.status==='REJECTED'&&roster.currentEligibility?.decision==='APPROVED'&&<p className="notice">The organizer has revoked this roster’s approval. The earlier eligibility decision below is retained as history; follow the current rejection note and resubmit for review.</p>}{roster.currentEligibility&&<EligibilityDetails declaration={roster.currentEligibility}/>}
  {canCorrect&&<div className="actions"><button className="secondary" disabled={!editable||members.length>=max} onClick={()=>{setMembers([...members,{participantKey:crypto.randomUUID(),fullName:'',jerseyNumber:null,captain:false}]);setDirty(true);}}>Add player</button><button disabled={!editable||!dirty||members.some(m=>m.fullName.trim().length<2)} onClick={()=>action(false)}>{roster.status==='REJECTED'?'Save corrections':'Save draft'}</button><button disabled={!editable||dirty||members.length<min||members.length>max||policy.eligibilityEnabled&&(!eligibilityAccepted||policy.eligibilityEvidenceRequired&&eligibilityResponse.trim().length<5)} onClick={()=>action(true)}>{roster.status==='REJECTED'?'Resubmit roster':'Submit roster'}</button></div>}
  {dirty&&<p className="muted">Save your changes before submitting and confirming eligibility.</p>}<EligibilityHistory rosterId={roster.id}/>
 </article>;
}

function RepresentativeProfile({email}:{email:string}){
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;void api<{profile:{name:string;phone:string}|null}>('/api/kala/representative').then(({profile})=>{if(active&&profile){setName(profile.name);setPhone(profile.phone);}}).catch(e=>{if(active)setMessage(e instanceof Error?e.message:'Could not load profile.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[email]);
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage('');try{await api('/api/kala/representative',{method:'POST',body:JSON.stringify({name,phone})});setMessage('Representative profile saved. An organizer can now assign an existing team to your verified account.');}catch(e){setMessage(e instanceof Error?e.message:'Could not save profile.');}finally{setBusy(false);}}
 return <form className="panel" onSubmit={save}><h2>Your representative profile</h2><p>Receiving an existing team? Save your profile, then give the organizer your verified email: <strong>{email}</strong>. Saving a profile does not claim a team.</p><fieldset disabled={busy||loading}><legend className="sr-only">Representative profile</legend><div className="grid form-grid"><label>Profile name<input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label><label>Profile phone<input required type="tel" maxLength={24} autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label></div><button>{busy?'Saving…':'Save representative profile'}</button></fieldset>{message&&<p role="status" className="notice">{message}</p>}</form>;
}
function AddSports({team,competitions,open,refresh}:{team:Team;competitions:Catalog['event']['competitions'];open:boolean;refresh:()=>Promise<void>}){
 const available=competitions.filter(c=>!team.rosters.some(r=>r.competition.sportCode===c.sportCode));const [sports,setSports]=useState<string[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function add(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage('');try{await api(`/api/kala/teams/${team.id}/sports`,{method:'POST',body:JSON.stringify({revision:team.ownershipRevision,sportCodes:sports})});await refresh();}catch(e){setMessage(e instanceof Error?e.message:'Could not add sports.');}finally{setBusy(false);}}
 if(!open||!available.length)return null;
 return <form className="panel" onSubmit={add}><h3>Add sports to {team.teamName}</h3><p>New sports start as drafts. Submitted and approved rosters stay locked. Save any current roster edits first; adding sports reloads the team.</p><fieldset disabled={busy}><legend>Additional sports</legend>{available.map(c=><label className="check" key={c.sportCode}><input type="checkbox" checked={sports.includes(c.sportCode)} onChange={e=>setSports(e.target.checked?[...sports,c.sportCode]:sports.filter(s=>s!==c.sportCode))}/>{c.sportCode}</label>)}<button disabled={!sports.length||sports.length>5}>{busy?'Adding…':'Add selected sports'}</button></fieldset>{message&&<p role="alert" className="notice">{message}</p>}</form>;
}
