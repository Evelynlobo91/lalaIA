import { LogOut } from "lucide-react";
import { Button } from "@/shared/ui";
import { logoutAction } from "../logout.action";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="secondary">
        <LogOut aria-hidden className="size-5" />
        Sair
      </Button>
    </form>
  );
}
