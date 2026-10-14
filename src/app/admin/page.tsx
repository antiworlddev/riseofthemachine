import AdminHome from './admin-home';
export const metadata={title:'Admin home | RISE OF THE MACHINE',robots:{index:false,follow:false}};
export default function Page(){return <div className="app-page"><section className="registration-page"><p className="eyebrow">Organizer access</p><h1>CONTROL ROOM<span className="red">.</span></h1><p>Manage the show, KALA GAMES, orders and event entry from one place.</p><AdminHome/></section></div>;}
