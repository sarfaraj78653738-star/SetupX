"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

const AK_KEY = "bsr.acknowledged";

export default function AcknowledgmentModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const acked = typeof window !== "undefined" && localStorage.getItem(AK_KEY);
    if (!acked) setOpen(true);
  }, []);

  const handleAcknowledge = () => {
    if (typeof window !== "undefined") localStorage.setItem(AK_KEY, "true");
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="max-w-md border-indigo-500/30 bg-[#0d1428] text-gray-100">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Before You Use This Tool</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 text-gray-300">
            <p>
              SetupX provides data analytics, technical indicators, and mathematical calculators for informational and educational purposes. 
            </p>
            <p>
              <strong>We are not SEBI-registered investment advisers or research analysts.</strong> Nothing on this site constitutes investment advice, a recommendation to buy or sell, or a solicitation of any kind.
            </p>
            <p className="text-xs text-gray-400">
              By continuing, you acknowledge:
            </p>
            <ul className="list-inside list-disc text-xs text-gray-400">
              <li>This tool provides data and calculations only, not investment advice</li>
              <li>You are solely responsible for your own trading decisions</li>
              <li>You will consult a qualified financial adviser before making any investment</li>
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={handleAcknowledge}
            className="bg-indigo-500 text-white hover:bg-indigo-400"
          >
            I Understand — Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
