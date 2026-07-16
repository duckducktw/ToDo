export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|.*\\..*).*)"],
};
