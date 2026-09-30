import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@pleadli/ui/components/select"
import { useTheme } from "./theme-provider"
import * as m from '@/paraglide/messages'

export const Toggletheme = () => {
    const { theme, setTheme } = useTheme()

    const items = [
        { value: "light", label: m["theme.light"]() },
        { value: "dark", label: m["theme.dark"]() },
        { value: "system", label: m["theme.system"]() },
    ]

    const handleValueChange = (value: string) => {
        setTheme(value as "light" | "dark" | "system")
    }

    return (
        <Select
            items={items}
            value={theme}
            onValueChange={(value) => handleValueChange(value as string)}
        >
            <SelectTrigger size='sm' className='max-w-xs'>
                <SelectValue placeholder={m["theme.placeholder"]()} />
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    {items.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                            {item.label}
                        </SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    )
}