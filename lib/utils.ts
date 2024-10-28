// /lib/utils.ts
export function cn(...classes: (string | undefined | null)[]) {
    return classes.filter(Boolean).join(" ");
}
