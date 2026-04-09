import BottomNav from "../components/BottomNav";
import DiaryClient from "../components/DiaryClient";

export default function DiaryPage() {
  return (
    <>
      <DiaryClient />
      <BottomNav active="diary" />
    </>
  );
}
