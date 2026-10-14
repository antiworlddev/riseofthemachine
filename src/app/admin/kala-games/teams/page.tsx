import TeamAdmin from './team-admin';
export const metadata={title:'KALA team ownership | RISE OF THE MACHINE',robots:{index:false,follow:false}};
export default function Page(){return <div className="app-page"><section className="registration-page"><p className="eyebrow">Organizer access</p><h1>KALA TEAMS<span className="red">.</span></h1><p><a href="/admin/kala-games">Roster review</a> · <a href="/admin/kala-games/settings">Registration settings</a></p><TeamAdmin/></section></div>;}
