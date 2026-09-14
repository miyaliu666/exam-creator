import { Button, type ButtonProps } from "@chakra-ui/react";
import { useContext } from "react";
import { AuthContext } from "../contexts/auth-context";

export function SignOutButton(props: ButtonProps) {
  const auth = useContext(AuthContext);
  return auth?.isPublicAccess ? null : <Button {...props} />;
}
