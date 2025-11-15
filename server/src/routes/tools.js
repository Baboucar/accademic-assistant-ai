import { Router } from 'express';
import { Queries } from '../db/queries.js';
export const tools = Router();
function weekday3FromISO(iso){ const d=new Date(iso+'T00:00:00'); return d.toLocaleDateString('en-GB',{weekday:'short'}); }
tools.post('/tools/find_next_class',(req,res)=>{
  const { course_code, date } = req.body||{};
  if(!course_code || !date) return res.status(400).json({ error:'course_code and date required' });
  res.json({ next_class: Queries.findNextClass(course_code, weekday3FromISO(date)) || null });
});
tools.post('/tools/get_day_schedule',(req,res)=>{
  const { day, dept } = req.body||{};
  if(!day) return res.status(400).json({ error:'day required' });
  res.json({ schedule: Queries.getDaySchedule(day.slice(0,3), dept) });
});
tools.post('/tools/search_calendar',(req,res)=>{
  const { keyword } = req.body||{};
  if(!keyword) return res.status(400).json({ error:'keyword required' });
  res.json({ events: Queries.searchCalendar(keyword) });
});
tools.post('/tools/search_notices',(req,res)=>{
  const { keyword } = req.body||{};
  if(!keyword) return res.status(400).json({ error:'keyword required' });
  res.json({ notices: Queries.searchNotices(keyword) });
});
tools.get('/tools/list_sources/:type',(req,res)=>{
  res.json({ sources: Queries.listSources(req.params.type) });
});
