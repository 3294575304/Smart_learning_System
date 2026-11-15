import { redirect } from "next/navigation";

/**
 * 收藏没有独立的列表页：它和错题共用「我的题库」的两个页签。
 * 侧栏给出「我的收藏」这个入口，落到同一个页面并直接打开收藏页签，
 * 这样侧栏可以按「回顾」分两组，而不必为了一个页签复制一套卡片。
 */
export default function StudentQuestionFavoritesPage() {
  redirect("/student/wrong-questions?view=favorites");
}
