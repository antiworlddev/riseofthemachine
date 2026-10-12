import type { Metadata } from 'next';
import SettingsDashboard from './settings-dashboard';
export const metadata:Metadata={title:'KALA GAMES | Organizer settings',robots:{index:false,follow:false}};
export default function SettingsPage(){return <div className="app-page"><section className="registration-page"><p className="eyebrow">ORGANIZER ACCESS</p><h1>KALA GAMES SETTINGS<span className="red">.</span></h1><p><a href="/admin/kala-games">Review rosters</a></p><SettingsDashboard/></section></div>;}
