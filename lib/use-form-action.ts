"use client";

// useActionState for forms that must keep what was typed when the server says no.
// React resets a <form action={…}> after every submit, which would wipe the fields on a
// validation error; submitting through onSubmit instead keeps them.
import { startTransition, useActionState, type FormEvent } from "react";

export function useFormAction<S>(fn: (prev: Awaited<S>, fd: FormData) => Promise<S>, initial: Awaited<S>) {
  const [state, dispatch, pending] = useActionState<S, FormData>(fn, initial);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    // Include the clicked submit button's name/value (e.g. "Add and enter another").
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget, submitter?.form === e.currentTarget ? submitter : null);
    startTransition(() => dispatch(fd));
  }
  return [state, onSubmit, pending] as const;
}
