import AuditDashboard from './audit-dashboard';
export const metadata={title:'Audit history | RISE OF THE MACHINE',robots:{index:false,follow:false}};
export default function Page(){return <div className="app-page"><section className="registration-page"><p className="eyebrow">Organizer access</p><h1>AUDIT HISTORY<span className="red">.</span></h1><p>Review recorded actions, actors and reasons.</p><AuditDashboard/></section></div>;}
