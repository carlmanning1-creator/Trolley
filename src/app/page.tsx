import { App } from "@/components/App";
import { AuthProvider } from "@/components/AuthProvider";

export default function Page() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}
