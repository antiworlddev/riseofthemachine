import type {Metadata} from 'next';
import TicketDashboard from './ticket-dashboard';
export const metadata:Metadata={title:'Ticket operations | RISE OF THE MACHINE',robots:{index:false,follow:false}};
export default function Page(){return <div className="app-page"><section className="registration-page"><p className="eyebrow">ORGANIZER ACCESS</p><h1>TICKET OPERATIONS<span className="red">.</span></h1><p><a href="/admin/kala-games">KALA GAMES review</a> · <a href="/staff/check-in">Staff check-in</a></p><p><a href="/admin/merch">Merch operations ↗</a></p><p><a href="/admin/payments">Payment reconciliation and refunds</a></p><TicketDashboard/></section></div>;}
