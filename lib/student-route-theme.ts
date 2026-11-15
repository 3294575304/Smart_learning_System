/** 只依据站内路径选择外观，不参与身份或资源授权。 */
export function isStudentRoute(pathname: string) {
  return pathname === "/student" || pathname.startsWith("/student/");
}

/** 在首屏内容绘制前执行；无需等待 React 水合或课程数据。 */
export const STUDENT_THEME_INIT =
  'var p=location.pathname;if(p==="/student"||p.indexOf("/student/")===0)document.documentElement.setAttribute("data-student-route","");';
