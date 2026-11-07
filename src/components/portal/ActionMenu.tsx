"use client";

import { Fragment } from "react";
import { Menu } from "@base-ui/react/menu";
import { ChevronDown } from "lucide-react";
import { T } from "@/components/i18n";

export type ActionItem = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  separated?: boolean;
};

export const QUICK_ACTIONS = [
  { key: "transfer", label: "Transfer" },
  { key: "resign", label: "Resign" },
];

const ITEM = "block w-full cursor-pointer rounded-md px-3 py-1.5 text-left text-sm text-gray-700 outline-none data-[highlighted]:bg-gray-100 data-[disabled]:opacity-50";

export default function ActionMenu({ items }: { items: ActionItem[] }) {
  return (
    <Menu.Root>
      <Menu.Trigger className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
        <T>Aksi</T> <ChevronDown size={13} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={4} className="z-50">
          <Menu.Popup className="min-w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg outline-none">
            {items.map((item) => (
              <Fragment key={item.label}>
                {item.separated && <Menu.Separator className="my-1 border-t border-gray-100" />}
                <Menu.Item className={ITEM} disabled={item.disabled} onClick={item.onClick}>
                  <T>{item.label}</T>
                </Menu.Item>
              </Fragment>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
