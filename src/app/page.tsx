import BottomNav from "./components/BottomNav";
import ChatClient from "./components/ChatClient";

export default function ChatPage() {
  return (
    <>
      <ChatClient />
      <BottomNav active="chat" />
    </>
  );
}
