import TournamentAdmin from './tournament-admin';
export const metadata={title:'KALA tournament operations | RISE OF THE MACHINE',robots:{index:false,follow:false}};
export default function Page(){return <div className="app-page"><section className="registration-page"><p className="eyebrow">Organizer access</p><h1>KALA TOURNAMENTS<span className="red">.</span></h1><p><a href="/admin/kala-games">Roster review</a> · <a href="/kala-games/fixtures">Public fixtures and standings</a></p><TournamentAdmin/></section></div>;}
