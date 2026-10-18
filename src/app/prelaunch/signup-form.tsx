'use client';
import {useId,useState,type FormEvent} from 'react';
export default function SignupForm({source}:{source:'waitlist'|'newsletter'}){
 const id=useId(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;const form=e.currentTarget,values=new FormData(form);setBusy(true);setError('');
 try{const response=await fetch('/api/subscribers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({firstName:values.get('firstName'),email:values.get('email'),source,newsletter:values.get('newsletter')==='on',website:values.get('website')||''})});const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Unable to sign up. Please try again.');setSuccess(data.message);form.reset();}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
 return <div className="fan-signup">{success?<div className="fan-success" role="status"><span aria-hidden="true">✓</span><h3>{source==='waitlist'?'You’re on the list.':'You’re in.'}</h3><p>{success}</p><p>We’re glad you’re here.</p></div>:<form onSubmit={submit} aria-label={source==='waitlist'?'Join the waitlist':'Subscribe to newsletter'}>
 <label htmlFor={`${id}-name`}>First name<input id={`${id}-name`} name="firstName" autoFocus={source==='waitlist'} autoComplete="given-name" maxLength={80} required placeholder="Your first name" disabled={busy}/></label>
 <label htmlFor={`${id}-email`}>Email address<input id={`${id}-email`} name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com" disabled={busy}/></label>
 <div className="fan-trap" aria-hidden="true"><label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
 <label className="fan-consent"><input name="newsletter" type="checkbox" required={source==='newsletter'} disabled={busy}/><span>{source==='waitlist'?'Also send me personal mails, news and exclusives from ODUMODUBLVCK.':'Yes, send me personal mails, news and exclusives from ODUMODUBLVCK.'}</span></label>
 <button className="fan-button fan-submit" disabled={busy} type="submit">{busy?'Joining…':source==='waitlist'?'Join the waitlist':'Subscribe'}<span aria-hidden="true">↗</span></button>
 {error&&<p className="fan-error" role="alert">{error}</p>}
 <p className="fan-privacy">{source==='waitlist'?'We’ll email you about the event launch. Joining does not reserve a ticket. ':''}Newsletter mails include an unsubscribe link. <a href="/privacy">How we use your details</a></p>
 </form>}</div>;
}
