import EmailDashboard from './email-dashboard';
export const metadata={title:'Email operations | RISE OF THE MACHINE',robots:{index:false,follow:false}};
export default function Page(){return <div className="app-page"><section className="registration-page"><p className="eyebrow">Organizer access</p><h1>EMAIL OPERATIONS<span className="red">.</span></h1><p>Inspect queued messages, delivery failures and controlled retry/resend requests.</p><EmailDashboard/></section></div>;}
