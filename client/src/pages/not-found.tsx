import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Leaf } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-[#f8f7f0] p-5 text-[#17483d]">
      <Card className="w-full max-w-md border-[#d9ddd1] bg-[#fffef9] shadow-[0_18px_50px_rgba(28,62,49,.08)]">
        <CardContent className="p-8 pt-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1e594a] text-[#dcc05b]">
            <Leaf className="h-6 w-6" />
          </div>
           <p className="font-mono text-[11px] font-medium uppercase tracking-[.15em] text-[#718679]">Error 404</p>
           <h1 className="mt-2 font-serif text-3xl font-semibold tracking-[-.03em]">This path doesn't exist.</h1>
           <p className="mt-3 text-sm leading-6 text-[#557067]">The page may have moved. Let's return to your study.</p>
           <Link href="/" className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#1e594a] px-4 py-2.5 text-sm font-semibold text-[#fffdf5] transition-colors hover:bg-[#17483d]"><ArrowLeft className="h-4 w-4" /> Back to map</Link>
        </CardContent>
      </Card>
    </div>
  );
}
