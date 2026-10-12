import TableAdmin from './table-admin';
export const metadata={title:'Table bookings | RISE OF THE MACHINE',robots:{index:false,follow:false}};
export default function Page(){return <div className="app-page"><section className="registration-page"><p className="eyebrow">Organizer access</p><h1>TABLE BOOKINGS<span className="red">.</span></h1><p><a href="/admin/tickets">Ticket sales settings</a> · <a href="/admin/payments">Payment support and refunds</a> · <a href="/staff/parking">VIP parking check-in</a></p><TableAdmin/></section></div>;}
