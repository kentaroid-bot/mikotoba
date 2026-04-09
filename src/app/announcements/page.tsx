import AnnouncementsClient from "../components/AnnouncementsClient";
import BottomNav from "../components/BottomNav";

export default function AnnouncementsPage() {
  return (
    <>
      <AnnouncementsClient />
      <BottomNav active="announcements" />
    </>
  );
}
