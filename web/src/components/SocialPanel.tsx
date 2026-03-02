import { useState } from "react";
import { apiPost } from "../lib/api";

export default function SocialPanel()
{
    const [friends, setFriends] = useState<string[]>([]);
    const [blockedUsers, setBlockedUsers] = useState<string[]>([]);

    return (
        <div>
            Social Panel
        </div>
    )
}