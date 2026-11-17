/** 路径只控制外观，角色与资源授权仍由原服务端入口执行。 */
export function isTeacherRoute(pathname: string) {
  return pathname === "/teacher" || pathname.startsWith("/teacher/");
}

export const TEACHER_THEME_INIT =
  'var p=location.pathname;if(p==="/teacher"||p.indexOf("/teacher/")===0)document.documentElement.setAttribute("data-teacher-route","");';
