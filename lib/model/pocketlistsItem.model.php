<?php

class pocketlistsItemModel extends waModel
{
    protected $table = 'pocketlists_item';


    public function getCompleted($contact_id = false, $date_range = false)
    {
        $pocket_rights = "";
        $pockets = array();
        // if user is admin - show all completed items
        // else only items user has access and null list items
        if (!pocketlistsHelper::isAdmin()) {
            $pockets = pocketlistsHelper::getAccessPocketForContact($contact_id);
            // only accessed pockets or null list items which are created or completed by user
//            $pocket_rights = "AND (
//                    p.id IN (i:pocket_ids)
//                    OR (p.id IS NULL AND (i.contact_id = i:contact_id OR i.complete_contact_id = i:contact_id)
//                  )";
            // only accessed pockets or null list items
            $pocket_rights = "AND (
                    p.id IN (i:pocket_ids)
                    OR p.id IS NULL
                  )";
        }

        $by_user = '';
        if ($contact_id) {
            $by_user = 'AND i.complete_contact_id = i:contact_id';
        }
        $by_date_range = '';
        if ($date_range && is_array($date_range)) {
            if (!empty($date_range['after'])) {
                $by_date_range = '  AND i.complete_datetime > s:date_after';
            }
            if (!empty($date_range['before'])) {
                $by_date_range .= '  AND i.complete_datetime < s:date_before';
            }
        }

        $sql = "SELECT
                  i.id id,
                  i.parent_id parent_id,
                  i.has_children has_children,
                  i.name name,
                  i.note note,
                  i.status status,
                  i.priority priority,
                  i.contact_id contact_id,
                  i.due_date due_date,
                  i.due_datetime due_datetime,
                  i.complete_datetime complete_datetime,
                  i.complete_contact_id complete_contact_id,
                  i.assigned_contact_id assigned_contact_id,
                  l.id list_id,
                  /*l.name list_name,*/
                  p.id pocket_id,
                  p.name pocket_name,
                  p.color pocket_color,
                  IF(uf.contact_id, 1, 0) favorite
                FROM {$this->table} i
                LEFT JOIN pocketlists_list l ON l.id = i.list_id
                LEFT JOIN pocketlists_pocket p ON p.id = l.pocket_id
                LEFT JOIN pocketlists_user_favorites uf ON uf.contact_id = i:contact_id AND uf.item_id = i.id
                WHERE
                  i.status > 0
                  {$pocket_rights}
                  {$by_user}
                  {$by_date_range}
                ORDER BY i.complete_datetime DESC";

        $items = $this->query(
            $sql,
            array(
                'contact_id' => wa()->getUser()->getId(),
                'pocket_ids' => $pockets,
                'date_after' => !empty($date_range['after']) ? $date_range['after'] : '',
                'date_before' => !empty($date_range['before']) ? $date_range['before'] : '',
            )
        )->fetchAll();
        foreach ($items as $id => $item) {
            $items[$id] = $this->updateItem($item);
        }
        return $items;
//        return $this->getTree($items, $tree);
    }

    public function getToDo($contact_id, $date = false)
    {
        // get to-do items only from accessed pockets
        $pockets = pocketlistsHelper::getAccessPocketForContact($contact_id);
        $due_date_or_mine = " AND (i.assigned_contact_id = i:contact_id OR i.assigned_contact_id IS NULL OR i.assigned_contact_id = 0)";
        if ($date) {
            $due_date_or_mine = "AND ((i.status = 0 AND (i.due_date = s:date OR DATE(i.due_datetime) = s:date)) OR (i.status > 0 AND DATE(i.complete_datetime) = s:date))";
        }
        $sql = "SELECT
                  i.id id,
                  i.parent_id parent_id,
                  i.has_children has_children,
                  i.name name,
                  i.note note,
                  i.status status,
                  i.priority priority,
                  i.contact_id contact_id,
                  i.create_datetime create_datetime,
                  i.due_date due_date,
                  i.due_datetime due_datetime,
                  i.complete_datetime complete_datetime,
                  i.complete_contact_id complete_contact_id,
                  i.assigned_contact_id assigned_contact_id,
                  i.key_list_id key_list_id,
                  l.id list_id,
                  l.icon list_icon,
                  /*l.name list_name,*/
                  p.id pocket_id,
                  p.name pocket_name,
                  p.color pocket_color,
                  IF(uf.contact_id, 1, 0) favorite
                FROM {$this->table} i
                LEFT JOIN pocketlists_list l ON (l.id = i.list_id  OR l.id = i.key_list_id)
                LEFT JOIN pocketlists_pocket p ON p.id = l.pocket_id
                LEFT JOIN pocketlists_user_favorites uf ON uf.contact_id = i:contact_id AND uf.item_id = i.id
                WHERE
                  (
                    i.contact_id = i:contact_id
                    AND (
                      i.calc_priority > 0
                      OR i.due_date IS NOT NULL
                      OR i.due_datetime IS NOT NULL
                    )
                    OR i.assigned_contact_id = i:contact_id
                    OR i.complete_contact_id = i:contact_id
                  )
                  AND (
                    l.archived = 0
                    OR l.archived IS NULL
                  )
                  AND ( /* items from accessed pockets or null list items */
                    p.id IN (i:pocket_ids)
                    OR p.id IS NULL
                  )
                  OR (i.list_id IS NULL AND i.key_list_id IS NULL)
                  {$due_date_or_mine}
                ORDER BY
                  i.status,
                  (i.complete_datetime IS NULL), i.complete_datetime DESC,
                  i.calc_priority DESC,
                  (i.due_date IS NULL), i.due_date ASC,
                  (i.due_datetime IS NULL), i.due_datetime ASC";

        $items = $this->query($sql, array(
            'pocket_ids' => $pockets,
            'contact_id' => $contact_id,
            'date' => $date))->fetchAll();
        foreach ($items as $id => $item) {
            $items[$id] = $this->updateItem($item);
        }
        return $items;
//        return $this->getTree($items, true);
    }

    public function getById($ids)
    {
        if (!is_array($ids)) {
            $ids = array($ids);
        }
//        $items = parent::getById($id);
        $items = $this->query(
            $this->getQuery()."WHERE id IN (i:id)",
            array('contact_id' => wa()->getUser()->getId(), 'id' => $ids)
        )->fetchAll();
//        $items = $this->getItems($this->getQuery(), null, false);
        foreach ($items as $id => $item) {
            $items[$id] = $this->updateItem($item);
        }
//        return $items;
        return count($ids) > 1 ? $items : reset($items);
    }

    public function updateWithCalcPriority($id, $item, $silent = false)
    {
        $us = new pocketlistsUserSettings();
        $email_me = $us->emailWhenNewAssignToMe();
        if (!$silent && $email_me) {
            $old_item = $this->getById($id);
        }

        $this->updatePriority($item);
        if ($this->updateById($id, $item)) {
            if ($silent && $email_me && // settings are set
                $item['assigned_contact_id'] && // assigned to me is set
                $item['assigned_contact_id'] == wa()->getUser()->getId() && // assigned id is mine
                $item['assigned_contact_id'] != $old_item['assigned_contact_id']
            ) { // assigned id is updated
                pocketlistsNotifications::notifyAboutNewAssign($item);
            }
            return true;
        }
    }

    private function getQuery()
    {
        return "SELECT
                  i.*,
                  IF(uf.contact_id, 1, 0) favorite
                FROM {$this->table} i
                LEFT JOIN pocketlists_user_favorites uf ON uf.contact_id = i:contact_id AND uf.item_id = i.id ";
    }

    public function getAllByList($list_id, $tree = true)
    {
        $sql = $this->getQuery() . "
                WHERE list_id = i:lid
                ORDER BY parent_id, sort ASC";

        return $this->getItems($sql, $list_id, $tree);
    }

    public function getUndoneByList($list_id, $tree = true)
    {
        $sql = $this->getQuery() . "
                WHERE list_id = i:lid AND status = 0
                ORDER BY parent_id, sort ASC";

        return $this->getItems($sql, $list_id, $tree);
    }

    public function getDoneByList($list_id, $tree = true)
    {
        $sql = $this->getQuery() . "
                WHERE list_id = i:lid AND status > 0
                ORDER BY complete_datetime DESC, parent_id, sort ASC";

        return $this->getItems($sql, $list_id, $tree);
    }

    public function getArchiveByList($list_id, $tree = true)
    {
        $sql = $this->getQuery() . "
                WHERE list_id = i:lid AND status < 0
                ORDER BY parent_id, sort ASC";

        return $this->getItems($sql, $list_id, $tree);
    }

    private function getItems($sql, $list_id, $tree)
    {
        $items = $this->query($sql, array('lid' => $list_id, 'contact_id' => wa()->getUser()->getId()))->fetchAll();
        foreach ($items as $id => $item) {
            $items[$id] = $this->updateItem($item);
        }
        return $tree ? $this->getTree($items, $tree) : $items;
    }

    private function getTree($items, $tree)
    {
        $result = array();
        foreach ($items as $id => $item) {
            $result[$item['id']] = $item;
            $result[$item['id']]['childs'] = array();
        }

        foreach ($result as $id => $item) {
            $result[$item['parent_id']]['childs'][$id] =& $result[$id];
        }
        if ($tree === true) {
            $result = isset($result[0]) ? $result[0]['childs'] : array();
        } elseif (is_numeric($tree)) {
            $result = isset($result[$tree]) ? array($tree => $result[$tree]) : array();
        }
        return $result;
    }

    private function updateItem($item)
    {
        // todo: bulk update?
        if ($item['contact_id']) {
            $user = new waContact($item['contact_id']);
            $item['username'] = $user->getName();
            $item['userpic'] = $user->getPhoto('20');
        }
        if ($item['assigned_contact_id']) {
            $user = new waContact($item['assigned_contact_id']);
            $item['assigned_username'] = $user->getName();
            $item['assigned_userpic'] = $user->getPhoto('20');
        }
        if ($item['complete_contact_id']) {
            $user = new waContact($item['complete_contact_id']);
            $item['complete_username'] = $user->getName();
            $item['complete_userpic'] = $user->getPhoto('20');
        }

        $this->updatePriority($item);

        return $item;
    }

    private function updatePriority(&$item)
    {
        $item['calc_priority'] = max(pocketlistsHelper::calcPriorityOnDueDate($item['due_date'], $item['due_datetime']), $item['priority']);
    }

    public function sortItems($list_id)
    {
        $sql = $this->getQuery()."WHERE
                  i.list_id = i:id
                  AND i.status = 0
                /*GROUP BY i.parent_id, i.id*/
                ORDER BY i.calc_priority DESC, (i.due_date IS NULL), i.due_date ASC, (i.due_datetime IS NULL), i.due_datetime ASC, i.name ASC";
//        $items = $this->getItems($sql, $list_id, false);
        $items = $this->query($sql, array('id' => $list_id, 'contact_id' => wa()->getUser()->getId()))->fetchAll();

        $sort = 0;
        foreach ($items as $item) {
            $this->updateById(
                $item['id'],
                array(
                    'update_datetime' => date("Y-m-d H:i:s"),
                    'sort' => $sort++
                )
            );
        }
        return $this->getTree($items, true);
    }

    public function getAssignedItemsCountAndNames($contact_ids)
    {
        if (!is_array($contact_ids)) {
            $contact_ids = array($contact_ids);
        }
        $q = "SELECT
                i.assigned_contact_id,
                i.name item_name
              FROM {$this->table} i
              JOIN pocketlists_list l ON l.id = i.list_id AND l.archived = 0
              WHERE i.assigned_contact_id IN (i:contact_id) AND status = 0";
        return $this->query($q, array('contact_id' => $contact_ids))->fetchAll('assigned_contact_id', 2);
    }

    public function getContactLastActivity($contact_ids)
    {
        if (!is_array($contact_ids)) {
            $contact_ids = array($contact_ids);
        }
        // ох что-то я сомневаюсь
        $q = "SELECT
              MAX(t.last_date) last_activity_datetime,
              t.contact_id contact_id
            FROM
              (
                  SELECT
                    i.complete_contact_id contact_id,
                    max(i.complete_datetime) last_date
                  FROM {$this->table} i
                  WHERE
                    i.complete_contact_id IN (i:contact_id)
                  GROUP BY i.complete_contact_id

                  UNION

                  SELECT
                    i.contact_id contact_id,
                    max(i.create_datetime) last_date
                  FROM {$this->table} i
                  WHERE
                    i.contact_id IN (i:contact_id)
                  GROUP BY i.contact_id
              ) t
            GROUP BY t.contact_id ";
        return $this->query($q, array('contact_id' => $contact_ids))->fetchAll('contact_id', 1);
    }

    public function getAssignedOrCompletesByContactItems($contact_id)
    {
        $pockets = pocketlistsHelper::getAccessPocketForContact($contact_id);

        $q = "SELECT
                  i.id id,
                  i.parent_id parent_id,
                  i.has_children has_children,
                  i.name name,
                  i.note note,
                  i.status status,
                  i.priority priority,
                  i.contact_id contact_id,
                  i.create_datetime create_datetime,
                  i.due_date due_date,
                  i.due_datetime due_datetime,
                  i.complete_datetime complete_datetime,
                  i.complete_contact_id complete_contact_id,
                  i.assigned_contact_id assigned_contact_id,
                  i.key_list_id key_list_id,
                  l.id list_id,
                  l.icon list_icon,
                  /*l.name list_name,*/
                  p.id pocket_id,
                  p.name pocket_name,
                  p.color pocket_color,
                  IF(uf.contact_id, 1, 0) favorite
                FROM {$this->table} i
                LEFT JOIN pocketlists_list l ON (l.id = i.list_id  OR l.id = i.key_list_id)
                LEFT JOIN pocketlists_pocket p ON p.id = l.pocket_id
                LEFT JOIN pocketlists_user_favorites uf ON uf.contact_id = i:contact_id AND uf.item_id = i.id
                WHERE
                  (
                    i.assigned_contact_id = i:contact_id AND i.status = 0
                    OR i.complete_contact_id = i:contact_id AND i.status > 0
                  )
                  AND (
                    l.archived = 0
                    OR l.archived IS NULL
                  )
                  AND ( /* only accessed pockets or null list */
                    p.id IN (i:pocket_ids)
                    OR p.id IS NULL
                  )
                ORDER BY
                  i.status,
                  (i.complete_datetime IS NULL), i.complete_datetime DESC,
                  i.calc_priority DESC,
                  (i.due_date IS NULL), i.due_date ASC,
                  (i.due_datetime IS NULL), i.due_datetime ASC";
        $items = $this->query($q, array('contact_id' => $contact_id, 'pocket_ids' => $pockets))->fetchAll();
        $results = array(
            0 => array(),
            1 => array()
        );
        foreach ($items as $id => $item) {
            $results[$item['status']][$id] = $this->updateItem($item);
        }
        return $results;
    }

    public function getDailyRecapItems($contact_id, $when)
    {
        $pockets = pocketlistsHelper::getAccessPocketForContact($contact_id);

        $now = time();
        $today = date("Y-m-d");
        $tomorrow = date("Y-m-d", strtotime("+1 day", $now));
        $seven_days = date("Y-m-d", strtotime("+7 days", $now));
        switch ($when) {
            case pocketlistsUserSettings::DAILY_RECAP_FOR_TODAY:
                $when = " AND (i.due_date = '" . $today . "' OR (i.due_datetime >= " .
                    strtotime($today) . " AND i.due_datetime < " . strtotime($tomorrow) . "))";
                break;
            case pocketlistsUserSettings::DAILY_RECAP_FOR_TODAY_AND_TOMORROW:
                $when = " AND (i.due_date = '" . $today . "' OR i.due_date = '" . $tomorrow . "' OR (i.due_datetime >= " .
                    strtotime($today) . " AND i.due_datetime < " . (strtotime($tomorrow) + 60 * 60 * 24) . "))";
                break;
            case pocketlistsUserSettings::DAILY_RECAP_FOR_NEXT_7_DAYS:
                $when = " AND (i.due_date >= '" . $today . "' AND i.due_date <= '" . $seven_days . "' OR (i.due_datetime >= " .
                    strtotime($today) . " AND i.due_datetime < " . (strtotime($seven_days) + 60 * 60 * 24) . "))";
                break;
        }
        $q = "SELECT
                i.*
              FROM {$this->table} i
              LEFT JOIN pocketlists_list l ON (l.id = i.list_id  OR l.id = i.key_list_id)
              LEFT JOIN pocketlists_pocket p ON p.id = l.pocket_id
              WHERE
                i.status = 0
                AND i.contact_id = i:contact_id
                AND (
                  l.archived = 0
                  OR l.archived IS NULL
                )
                AND (
                  i.assigned_contact_id = i:contact_id
                  OR i.assigned_contact_id IS NULL
                  OR i.assigned_contact_id = 0
                )
                AND ( /* only accessed pockets or null list */
                  p.id IN (i:pocket_ids)
                  OR p.id IS NULL
                )
                OR (i.list_id IS NULL AND i.key_list_id IS NULL)
                {$when}";

        $items = $this->query($q, array('contact_id' => $contact_id, 'pocket_ids' => $pockets))->fetchAll();
        foreach ($items as $id => $item) {
            $items[$id] = $this->updateItem($item);
        }
        return $items;
    }

    public function getAppCountForUser()
    {
        $us = new pocketlistsUserSettings();
        $icon = $us->appIcon();

        $pocket_rights = "";
        $pockets = array();
        // if user is admin - show all completed items
        // else only items user has access and null list items
        if (!pocketlistsHelper::isAdmin()) {
            $pockets = pocketlistsHelper::getAccessPocketForContact();
            // only accessed pockets or null list items which are created or completed by user
//            $pocket_rights = "AND (
//                    p.id IN (i:pocket_ids)
//                    OR (p.id IS NULL AND (i.contact_id = i:contact_id OR i.complete_contact_id = i:contact_id)
//                  )";
            // only accessed pockets or null list items
            $pocket_rights = "AND (
                    p.id IN (i:pocket_ids)
                    OR p.id IS NULL
                  )";
        }

        $now = @waDateTime::parse('Y-m-d H:i:s', waDateTime::date('Y-m-d H:i:s'));
        $today = date("Y-m-d");
        $tomorrow = date("Y-m-d", strtotime("+1 day"));
        $day_after_tomorrow = date("Y-m-d", strtotime("+2 day"));

        $colors = "";
        switch ($icon) {
            case pocketlistsUserSettings::ICON_OVERDUE: // overdue
                $colors = "AND ((i.due_date <= '{$today}' AND i.due_datetime < '{$now}') OR i.due_date < '{$today}' OR i.calc_priority = 3)";
                break;
            case pocketlistsUserSettings::ICON_OVERDUE_TODAY: // overdue + today
                $colors = "AND (i.due_date <= '" . $today . "' OR i.due_datetime < '" . $tomorrow . "' OR i.calc_priority IN (2, 3))";
                break;
            case pocketlistsUserSettings::ICON_OVERDUE_TODAY_AND_TOMORROW: // overdue + today + tomorrow
                $colors = "AND (i.due_date <= '" . $tomorrow . "' OR i.due_datetime < '" . $day_after_tomorrow . "' OR i.calc_priority IN (1, 2, 3))";
                break;
            default:
                return '';
        }

        $q = "
          SELECT
            i.id
          FROM {$this->table} i
          LEFT JOIN pocketlists_list l ON (l.id = i.list_id  OR l.id = i.key_list_id)
          LEFT JOIN pocketlists_pocket p ON p.id = l.pocket_id
          WHERE
            (
              (
                i.contact_id = i:contact_id
                OR i.assigned_contact_id = i:contact_id
                OR i.complete_contact_id = i:contact_id
              )
              AND (
                l.archived = 0
                OR l.archived IS NULL
              )
              OR (i.list_id IS NULL AND i.key_list_id IS NULL)
            )
            {$colors}
            {$pocket_rights}";

        if ($icon !== false && $icon != pocketlistsUserSettings::ICON_NONE) {
            $count = $this->query($q, array(
                'contact_id' => wa()->getUser()->getId(),
                'pocket_ids' => $pockets))->count();
            return $count;
        } else {
            return null;
        }
    }
}
