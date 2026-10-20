"use client";
import {useEffect, useState} from "react";
export default function Studio() {
 const [App,setApp]=useState<any>(null);
 useEffect(()=>{import("../src/main.jsx").then(m=>setApp(()=>m.default));},[]);
 return App ? <App/> : <main style={{padding:48}}>Opening Folio Book Studio…</main>;
}
