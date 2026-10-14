import StaffDashboard from './staff-dashboard';
export const metadata={title:'Staff access | RISE OF THE MACHINE',robots:{index:false,follow:false}};
export default function Page(){return <div className="app-page"><section className="registration-page"><p className="eyebrow">Organizer access</p><h1>STAFF ACCESS<span className="red">.</span></h1><p>Grant organizer and scanner roles to verified accounts.</p><StaffDashboard/></section></div>;}
