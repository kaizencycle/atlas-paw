import { signIn } from "@/lib/auth";

export default function SignInPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 gap-6">
      <div className="text-center space-y-2">
        <span className="text-atlas text-3xl" aria-hidden="true">
          ⬡
        </span>
        <h1 className="text-lg font-semibold text-atlas tracking-wide">
          ATLAS PAW
        </h1>
        <p className="text-dim text-sm max-w-xs">
          Sign in with the linked GitHub account to use your personal ATLAS
          workstation.
        </p>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-atlas text-bg border border-atlas-dim active:opacity-90"
        >
          Continue with GitHub
        </button>
      </form>
    </div>
  );
}
