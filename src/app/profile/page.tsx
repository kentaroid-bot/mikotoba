import BottomNav from "../components/BottomNav";
import ProfileClient from "../components/ProfileClient";

export default function ProfilePage() {
  return (
    <>
      <ProfileClient />
      <BottomNav active="profile" />
    </>
  );
}
