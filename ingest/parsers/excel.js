import xlsx from 'xlsx';
export function parseExcelTimetable(path, deptGuess='UNKNOWN'){
  const wb=xlsx.readFile(path); const sheet=wb.Sheets[wb.SheetNames[0]];
  const rows=xlsx.utils.sheet_to_json(sheet,{defval:''}); const out=[];
  for(const r of rows){
    const cc=r.course_code||r.Course||r['Course Code']||r['course']||'';
    const title=r.course_title||r.Title||r['Course Title']||'';
    const day=r.day||r.Day||''; const s=r.start_time||r.Start||r['Start']||'';
    const e=r.end_time||r.End||r['End']||''; const venue=r.venue||r.Room||r.Hall||'';
    const lec=r.lecturer||r.Instructor||r.Teacher||'';
    if(cc && day && s && e){
      out.push([deptGuess,String(cc).trim(),String(title).trim(),String(day).trim(),
                String(s).trim(),String(e).trim(),String(venue).trim(),String(lec).trim()]);
    }
  }
  return out;
}
