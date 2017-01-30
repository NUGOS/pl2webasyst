<?php

class pocketlistsHelper
{
    const APP_ID = 'pocketlists';
    const COLOR_DEFAULT = 'blue';

    /**
     * Return users for given list
     * @param bool|integer $list_id
     * @param int $photo_size
     * @return array
     */
    public static function getAccessContactsForList($list_id = false, $photo_size = 20)
    {
        $wcr = new waContactRightsModel();
        // select users
        $query = "SELECT DISTINCT
                group_id
            FROM wa_contact_rights
            WHERE
              (app_id = 'pocketlists' AND ((name LIKE s:id AND value = 1) OR (name = 'backend' AND value = 2))
              OR
              (app_id = 'webasyst' AND name = 'backend' AND value = 1))";
        $contact_ids = $wcr->query(
            $query,
            array(
                'id' => 'list.' . ($list_id ? $list_id : '%')
            )
        )->fetchAll();
        $contacts = array();
        $groups = array();
        $gm = new waUserGroupsModel();
        foreach ($contact_ids as $id) {
            if ($id['group_id'] < 0) {
                $contact = new waContact(-$id['group_id']);
                $contacts[$contact->getId()] = array(
                    'username' => $contact->getName(),
                    'userpic' => $contact->getPhoto($photo_size),
                    'login' => $contact['login'],
                    'status' => $contact->getStatus()
                );
            } else {
                $groups[] = $id['group_id'];
            }
        }
        $contact_ids = array();
        foreach ($groups as $group_id) {
            $contact_ids = array_merge($contact_ids, $gm->getContactIds($group_id));
        }
        foreach ($contact_ids as $id) {
            $contact = new waContact($id);
            if (!isset($contacts[$contact->getId()])) {
                $contacts[$contact->getId()] = array(
                    'username' => $contact->getName(),
                    'userpic' => $contact->getPhoto($photo_size),
                    'login' => $contact['login'],
                    'status' => $contact->getStatus()
                );
            }
        }
        return $contacts;
    }

    /**
     * Return all list ids accessible for given user
     * @param bool|integer $contact_id
     * @return array|bool
     */
    public static function getAccessListForContact($contact_id = false)
    {
        $user = $contact_id ? new waContact($contact_id) : wa()->getUser();
        if ($user->isAdmin() || $user->isAdmin('pocketlists')) {
            $list_model = new pocketlistsListModel();
            $lists = $list_model->getAll('id');
        } else {
            $lists = $user->getRights('pocketlists', 'list.%');
        }
        // todo: может сразу возвращать модели?
        return $lists ? array_keys($lists) : false;
    }

    /**
     * @return array
     */
    public static function getAllListsContacts()
    {
        $wcr = new waContactRightsModel();
        $query = "SELECT DISTINCT
                group_id
            FROM wa_contact_rights
            WHERE
              (app_id = 'pocketlists' AND name = 'backend' AND value > 0)
              OR
              (app_id = 'webasyst' AND name = 'backend' AND value > 0)
            ORDER BY group_id ASC";
        $contact_ids = $wcr->query($query)->fetchAll();
        $contacts = array();
        $groups = array();
        $gm = new waUserGroupsModel();
        foreach ($contact_ids as $id) {
            if ($id['group_id'] < 0) { // user
                $contacts[-$id['group_id']] = -$id['group_id'];
            } else { // group
                $groups[] = $id['group_id'];
            }
        }
        $contact_ids = array();
        foreach ($groups as $group_id) {
            $contact_ids = array_merge($contact_ids, $gm->getContactIds($group_id));
        }
        foreach ($contact_ids as $id) {
            $contacts[$id] = $id;
        }
        return $contacts;
    }

    /**
     * Check if user is admin
     * @param bool|integer $contact_id
     * @return bool
     */
    public static function isAdmin($contact_id = false)
    {
        $user = $contact_id ? new waContact($contact_id) : wa()->getUser();
        $result = $user->isAdmin() || $user->isAdmin('pocketlists');
        return $result;
    }

    public static function getDueDatetime(&$date)
    {
        if (!empty($date['due_date']) &&
            !empty($date['due_datetime_hours']) &&
            !empty($date['due_datetime_minutes'])
        ) {
            $tm = strtotime($date['due_date'] . " " . $date['due_datetime_hours'] . ":" . $date['due_datetime_minutes'] . ":00");
            $tm = self::convertToServerTime($tm);
            $date['due_datetime'] = waDateTime::date("Y-m-d H:i:s", $tm);
            unset($date['due_datetime_hours']);
            unset($date['due_datetime_minutes']);
        } else {
            $date['due_datetime'] = null;
        }

        if (!empty($date['due_date'])) {
            $date['due_date'] = date("Y-m-d", strtotime($date['due_date']));
//            waDateTime::parse('date', waDateTime::format('date', $date['due_date']));
        } else {
            $date['due_date'] = null;
        }
    }

    // thanks to hub
    public static function convertToServerTime($timestamp)
    {
        $timezone = wa()->getUser()->getTimezone();
        $default_timezone = waDateTime::getDefaultTimeZone();
        if ($timezone && $timezone != $default_timezone) {
            $date_time = new DateTime(date('Y-m-d H:i:s', $timestamp), new DateTimeZone($timezone));
            $date_time->setTimezone(new DateTimeZone($default_timezone));
            $timestamp = (int) $date_time->format('U');
        }
        return $timestamp;
    }

    public static function calcPriorityOnDueDate($due_date, $due_datetime)
    {
        $now = time();
        $due_status = 0;

        if (!empty($due_date) || !empty($due_datetime)) {
            if (!empty($due_datetime) && $now > strtotime($due_datetime)) { // overdue datetime
                $due_status = 3;
            } elseif (strtotime(date("Y-m-d")) > strtotime($due_date)) { // overdue date
                $due_status = 3;
            } elseif ($due_date == date("Y-m-d")) { // today
                $due_status = 2;
            } elseif ($due_date == date("Y-m-d", $now + 60 * 60 * 24)) { // tomorrow
                $due_status = 1;
            }
        }

        return $due_status;
    }

    public static function getItemChildIds($item_id, $item, &$return)
    {
        $return[] = $item['id'];
        foreach ($item['childs'] as $i) {
            self::getItemChildIds($item_id, $i, $return);
        }
    }

    public static function getListIcons()
    {
//        $path = wa()->getAppPath('img/listicons/', wa()->getApp());
        $icon_ids = array(
            "list",
            "achtung",
            "books",
            "calendar",
            "construction",
            "gift",
            "grocery",
            "gym",
            "idea",
            "invoice",
            "medicine",
            "money",
            "passport",
            "recipe",
            "star",
            "travel",
            "vacations",

            "award",
            "bag",
            "calcuator",
            "cart",
            "checkout",
            "clock",
            "coins",
            "contact",
            "delivery",
            "diagram",
            "home",
            "list2",
            "lock",
            "palette",
            "pencil",
            "phone",
            "piggy",
            "plane",
            "service",
            "tools",
            "video",
            "work",
            "calendar-notavailable",

            "paid-christmas",
            "paid2-christmas-ball",
            "paid2-christmas-stocking",
            "paid2-santa",
            "paid2-snowman",
            "paid2-gingerbread",
            "paid2-mistletoe",
            "paid-birthday",
            "paid-baloons",

            "paid-map",
            "paid2-location",
            "paid-music",
            "paid-microphone",
            "paid-newspaper",
            "paid-notepad",
            "paid-tie",
            "paid2-car",
            "paid2-chat",
            "paid2-clock",
            "paid2-iphone",
            "paid2-keys",
            "paid2-sunglasses",
            "paid2-yinyang",
            "paid2-camera",
            "paid2-hotspot",
            "paid2-ladies-shoe",
            "paid2-checkmark",
            "paid2-landscape",
            "paid2-guitar",
            "paid2-tent",
            "paid2-crab",
            "paid2-boxes",
            "paid2-arrows",
            "paid-run",
            "paid-bicycle",
            "paid-baseball",
            "paid-basketball",
            "paid-football",

            "paid-avocado",
            "paid-banana",
            "paid-apple",
            "paid-pear",
            "paid-corn",
            "paid-watermelon",
            "paid-carrot",
            "paid-pizza",
            "paid-steak",
            "paid-icecream",
            "paid-lollipops",
            "paid-spaghetti",
            "paid-chicken",
            "paid-eggs",
            "paid-bread",
            "paid-candy",
            "paid-cherry",
            "paid-coffee",
            "paid-starbucks",
            "paid-cocktail",
            "paid-whisky-bottle",
            "paid-wine-bottle",
            "paid-wine-glass",

            "paid-rain",
            "paid-cloud-sun",
            "paid-sun",
            "paid-snow",
            "paid-thunderstorm",
            "paid-umbrella",
            "paid-alarmclock",

            "paid-baby",
            "paid-babybottle",
            "paid-bear",
            "paid-dogcat",
            "paid-animal",
            "paid-armchair",
            "paid-bed",
            "paid-chestofdraws",
            "paid-desk",
            "paid-diamond",
            "paid-discount",
            "paid-dj",
            "paid-diskette",
            "paid-education",
            "paid-fire-ext",
            "paid-flashlight",
            "paid-flower",
            "paid-gameboy",
            "paid-gamecontroller",
            "paid-globe",
            "paid-saturn",
            "paid-ufo",
            "paid-alien",
            "paid-hammer",
            "paid-hanger",
            "paid-wardrobe",
            "paid-tv",
            "paid-imac",
            "paid-safebox",
            "paid-scissors",
            "paid-sock",
            "paid-paint",
            "paid-paintbrush",
            "paid-klmn",
            "paid-knives",
            "paid-pan",
            "paid-pin",
            "paid-scoop",
            "paid-thermo",
            "paid-trash",

            "yeme-beer",
            "yeme-becherovka",
            "yeme-mojito",
            "yeme-cognac",
            "yeme-redwine",
            "yeme-blue-hawaii",
            "yeme-whisky",
            "yeme-jagermeister",

            "flag-eu",
            "flag-usa",
            "flag-canada",
            "flag-uk",
            "flag-australia",
            "flag-new-zealand",
            "flag-france",
            "flag-germany",
            "flag-italy",
            "flag-spain",
            "flag-portugal",
            "flag-switzerland",
            "flag-netherlands",
            "flag-norway",
            "flag-sweden",
            "flag-finland",
            "flag-denmark",
            "flag-belgium",
            "flag-greece",
            "flag-japan",
            "flag-china",
            "flag-hongkong",
            "flag-korea",
            "flag-india",
            "flag-russia",
            "flag-ukraine",
            "flag-belarus",
            "flag-israel",
            "flag-turkey",
            "flag-brazil",
            "flag-jamaica",
            "flag-argentina",
            "flag-chile",
            "flag-colombia",
            "flag-vietnam",
            "flag-thailand",
            "flag-mexico",
            "flag-south-africa",
            "flag-indonesia",
            "flag-kenya",

            "paid3-smiley-happy",
            "paid3-smiley-unhappy",
            "paid3-bookmark",
            "paid3-ribbon",
            "paid3-apple",
            "paid3-anchor",
            "paid3-trafficlight",
            "paid3-goal",
            "paid3-userpic-hipster",
            "paid3-userpic-man",
            "paid3-userpic-lady",
            "paid3-userpic-steve",

            "paid4-christmas-reindeer",
            "paid4-christmas-sleigh",
            "paid4-christmas-gloves",
            "paid4-christmas-santa",
            "paid4-christmas-house",
            "paid4-christmas-tree",
            "paid4-christmas-cocktail",
            "paid4-christmas-glass",
            "paid4-christmas-giftbox",
            "paid4-christmas-giftbox2",
            "paid4-christmas-calendar",
            "paid4-christmas-candy",
            "paid4-christmas-gingerbread",
            "paid4-christmas-snowman",
            "paid4-christmas-sale",
            "paid4-christmas-globes",
        );
        $icons = array();
        foreach ($icon_ids as $icon_id) {
            $icons[$icon_id] = 'li-'.$icon_id.'@2x.png';
        }

        return $icons;
    }

    public static function canAccessToList($list_id, $contact_id = false)
    {
        $available_lists = pocketlistsHelper::getAccessListForContact($contact_id);
        return in_array($list_id, $available_lists);
    }

    private static function compare_last_activity($a, $b)
    {
        return strtotime($b['last_activity']) - strtotime($a['last_activity']);
    }

    public static function getTeammates($teammates_ids, $sort_by_last_activity = true, $exclude_me = true)
    {
        $teammates = array();

        $im = new pocketlistsItemModel();
        $items_count_names = $im->getAssignedItemsCountAndNames($teammates_ids);
        $last_activities = $im->getLastActivities($teammates_ids);
        foreach ($teammates_ids as $tid) {
            if ($exclude_me && $tid == wa()->getUser()->getId()) {
                continue;
            }
            $mate = new waContact($tid);
            $teammates[$tid]['name'] = $mate->getName();
            $teammates[$tid]['id'] = $mate->getId();
            $teammates[$tid]['photo_url'] = $mate->getPhoto();
            $teammates[$tid]['login'] = $mate->get('login');
            $teammates[$tid]['status'] = $mate->getStatus();

            $teammates[$tid]['last_activity'] = isset($last_activities[$tid]) ? $last_activities[$tid] : false;
            $teammates[$tid]['items_info'] = array(
                'count' => 0,
                'names' => "",
                'max_priority' => 0,
            );
            if (isset($items_count_names[$tid])) {
                $teammates[$tid]['items_info'] = array(
                    'count' => count($items_count_names[$tid]['item_names']),
                    'names' => implode(', ', $items_count_names[$tid]['item_names']),
                    'max_priority' => $items_count_names[$tid]['item_max_priority'],
                );
            }
        }

        if ($sort_by_last_activity) {
            usort($teammates, array('pocketlistsHelper', "compare_last_activity"));
        }

        return $teammates;
    }

    public static function canCreateLists()
    {
        return wa()->getUser()->getRights(self::APP_ID, 'cancreatelists');
    }

    public static function canAssign()
    {
        return wa()->getUser()->getRights(self::APP_ID, 'canassign');
    }
}
