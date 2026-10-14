import type {Metadata} from 'next';
import TicketDashboard from './ticket-dashboard';
export const metadata:Metadata={title:'Ticket operations | RISE OF THE MACHINE',robots:{index:false,follow:false}};
export default function Page(){return <div className="app-page"><section className="registration-page"><p className="eyebrow">ORGANIZER ACCESS</p><h1>TICKET OPERATIONS<span className="red">.</span></h1><TicketDashboard/></section></div>;}
