"use strict";

/**
 * for items
 * - add
 * - complete
 * - replace
 * - drag
 */
$.pocketlists.Items = function($list_items_wrapper, options) {
    var $undone_items_wrapper = $list_items_wrapper.find('[data-pl-items="undone"] > ul.menu-v'),
        $sortable_items = $('[data-pl-items="undone"]').find('ul.menu-v'),
        $done_items = $list_items_wrapper.find('#pl-complete-log'),
        $done_items_wrapper = $done_items.find('ul.menu-v').first(),
        item_selector = '[data-parent-id]',
        // $add_item_link = $('#pl-item-add-link'),
        $show_logbook_items = $('#pl-complete-log-link'),
        $empty_list_msg = $list_items_wrapper.find('#pl-empty-list-msg'),
        $current_item = null,
        o = $.extend({}, {
            enableAddLinkOnHover: true,
            enableChangeLevel: true,
            enableSortItems: true,
            list: null,
            assignUser: null,
            showMessageOnEmptyList: false,
            dueDate: '',
            filter: false,
            archive: false,
            allowChat: true,
            current_user_id: 0
        }, options),
        request_in_action = false;

    // todo: add wrapper around $.post $.get with request_in_action implementation

    // sortable items
    var initSortable = function () {
        if (o.enableSortItems) {
            $sortable_items.sortable({
                item: item_selector,
                handle: '[data-pl-action="item-sort"]',
                distance: 5,
                connectWith: "ul.menu-v",
                placeholder: 'pl-item-placeholder',
                tolerance: 'pointer',
                start: function(e, ui ){
                    ui.placeholder.height(ui.helper.outerHeight());
                },
                stop: function (event, ui) {
                    var $prev = ui.item.parents(item_selector).first(),
                        parent_id = $prev.length ? parseInt($prev.data('id')) : 0;

                    ui.item.data('parent-id', parent_id);
                    updateSort(parseInt(ui.item.data('id')));
                }
            });
        } else {
            $sortable_items.find('[data-pl-action="item-sort"]').hide();
        }
    };
    // save item
    var addItem = function (data, callback) {
        if (request_in_action) {
            return;
        }
        request_in_action = true;

        var $this = $(this),
            isTopAdd = $this.closest('[data-pl-item-add-top]').length;

        if (o.dueDate) {
             $.each(data, function(i) {
                  data[i]['due_date'] = o.dueDate;
             });
         }
        var $pl_done = $this.closest('.pl-item').find('.pl-done-label span').addClass('transparent').html($.pocketlists.$loading);
        $.post(
            '?module=item&action=create',
            {
                list_id: o.list ? o.list.list_id : 0,
                data: data,
                assigned_contact_id: o.assignUser ? o.assignUser : false,
                filter: o.filter
            },
            function (html) {
                $.pocketlists.updateAppCounter();
                $.pocketlists.reloadSidebar();
                $.pocketlists.$loading.remove();
                $pl_done.removeClass('transparent');

                var $li = $this.closest(item_selector),
                    $html = $('' + html + ''),
                    _itemAdd = isTopAdd ? NewItemWrapper.top_new_item : NewItemWrapper.new_item;

                if (!o.enableSortItems) {
                    $html.find('[data-pl-action="item-sort"]').hide();
                }

                _itemAdd.textarea.data('can_blur', false);
                if ($li.length) {
                    if (!$li.parents(item_selector).length || // not root item
                            //$li.prev(item_selector).length || // not first item in subs
                        _itemAdd.wrapper.prev('.pl-item').length) { // new item wrapper is after item
                        $li.after($html);
                    } else {
                        $li.before($html);
                    }
                } else { // added to top
                    _itemAdd.wrapper.after($html);
                }
                $html.filter(item_selector).last()
                    .find('.pl-item').first().after(_itemAdd);

                _itemAdd.textarea.val('').css('height', 'auto').data('can_blur', true);
                setTimeout(function () {
                    _itemAdd.textarea.val('').trigger('focus');
                }, 500);

                // update calendar date with new dot
                var $calendar = $('.pl-calendar');
                if (!o.list && $calendar.length) {
                    $.get('?module=json&action=getItemsPocketColor&id=' + parseInt($html.data('id')), function (r) {
                        if (r.status === 'ok') {
                            var $selected_date = $calendar.find('.pl-selected').length ? $calendar.find('.pl-selected') : $calendar.find('.pl-today'),
                                $dots_wrapper = $selected_date.find('.pl-dots'),
                                $new_dot = $('<i class="icon10 color pl-dark-' + r.data + '">');

                            if (!$dots_wrapper.length) {
                                $dots_wrapper = $('<div class="pl-dots">');
                                $selected_date.append($dots_wrapper);
                            }

                            if ($dots_wrapper.find('i').not('.pl-dark-none').length < 3) {
                                $dots_wrapper.append($new_dot);
                            }
                        }
                    }, 'json');
                }

                hideEmptyListMessage();
                updateListCountBadge();
                updateSort();

                request_in_action = false;

                $.isFunction(callback) && callback.call($this);
            }
        );
    };
    // update item
    var updateItem = function ($form, callback) {
        var item_id = $form.find('#pl-item-list-id').val(),
            item_list_id = $form.find('#pl-item-list-id').val(),
            item_list_id_new = $form.find('[name="item\[list_id\]"]').val();

        var afterUpdateItem = function(html, callback) {
            $.pocketlists.updateAppCounter();
            $.pocketlists.reloadSidebar();
            $.pocketlists.$loading.remove();
            replaceItem(html);
            // update indicator color
            if (o.list) {
                var priority = 0,
                    list_priority = 0,
                    $list_count = $('#pl-lists').find('[data-pl-list-id="' + o.list.list_id + '"] span.count');

                var priority_class = {
                        'green': 1, 'pl-green': 1, 'pl-due-tomorrow': 1,
                        'yellow': 2, 'pl-yellow': 2, 'pl-due-today': 2,
                        'red': 3, 'pl-red': 3, 'pl-due-overdue': 3,
                        'none': 0, 'pl-none':0, 'pl-due-someday': 0, 'undefined': 0
                    },
                    class_priority = {
                        1: ' indicator green', 2: ' indicator yellow', 3: ' indicator red', 0: ''
                    };

                // item moved to another
                if (item_list_id != item_list_id_new) {
                    // update other list count && indicator color
                    var $other_list_count = $('#pl-lists').find('[data-pl-list-id="' + item_list_id_new + '"] span.count'),
                        other_list_count = parseInt($other_list_count.text()),
                        other_list_priority = 0,
                        other_list_class = $other_list_count.attr('class').match(/count\sindicator\s(.+)/),
                        other_list_items = getItems($('<div>').html($current_item));

                    $.each(other_list_items, function () {
                        other_list_priority = Math.max(other_list_priority, this.priority);
                    });

                    $other_list_count.text(other_list_count + other_list_items.length);
                    $other_list_count.removeClass().addClass('count' + class_priority[Math.max(other_list_priority, (other_list_class ? priority_class[other_list_class[1]] : 0))]);

                    removeItem($form.find('input[name="item\[id\]"]').val());
                    updateListCountBadge();
                }

                $.each(getItems(), function () {
                    priority = Math.max(priority, this.priority);
                });
                // don't forget about list priority
                var $list_due = o.list.$el.find('.pl-list-due');
                if ($list_due.length) {
                    list_priority = priority_class[$list_due.attr('class').match(/pl-list-due\s(pl-.*)/)[1]];
                }

                $list_count.removeClass().addClass('count' + class_priority[Math.max(priority, list_priority)]);
            }
            $.isFunction(callback) && callback.call();
        };

        var _iframePost = function ($form, callback) {
            if (request_in_action) {
                return;
            }
            request_in_action = true;


            var form_id = $form.attr('id'),
                iframe_id = form_id + '-iframe';

            // add hidden iframe if need
            if (!$('#' + iframe_id).length) {
                $form.after("<iframe id=" + iframe_id + " name=" + iframe_id + " style='display:none;'></iframe>");
            }

            var $iframe = $('#' + iframe_id);
            $form.attr('target', iframe_id);

            $iframe.one('load', function () {
                var html = $(this).contents().find('body').html();
                afterUpdateItem(html, callback);
                request_in_action = false;
            });
        };
        //var _ajaxPost = function ($form, callback) {
        //    $.post('?module=item&action=data', $form.serialize(), function (html) {
        //        afterUpdateItem(html, callback);
        //    });
        //};

        _iframePost($form, callback);
    };
    // get all items list
    var getItems = function ($items_wrapper) {
        $items_wrapper = $items_wrapper || $undone_items_wrapper;
        var data = [];
        $items_wrapper.find(item_selector).each(function (i) {
            var $this = $(this),
                color = $this.find('.pl-done').length ? $this.find('.pl-done').attr('class').match(/pl-done\s(pl-.*)/) : null,
                priority = 0;
            if (color && color.length > 0) {
                switch (color[1]) {
                    case 'pl-red':
                        priority = 3;
                        break;
                    case 'pl-yellow':
                        priority = 2;
                        break;
                    case 'pl-green':
                        priority = 1;
                        break;
                }
            }
            data.push({
                id: $this.data('id'),
                parent_id: $this.data('parent-id'),
                sort: i,
                has_children: $this.find(item_selector).length ? 1 : 0,
                priority: priority
            });
        });
        return data;
    };
    // update sort base on current positions
    var updateSort = function (id) {
        //this.find('label').first().append($.pocketlists.$loading);
        if (o.enableSortItems && o.list) {
            if (request_in_action) {
                return;
            }
            request_in_action = true;

            $.post(
                '?module=item&action=sort',
                {
                    list_id: o.list.list_id,
                    item_id: id ? id : 0,
                    data: getItems()
                },
                function (r) {
                    if (r.status === 'ok') {
                        initSortable();
                    } else {
                        alert(r.errors);
                    }
                    //$.pocketlists.$loading.remove();
                    request_in_action = false;
                },
                'json'
            );
        }
    };
    // complete/uncomplete items
    var completeItem = function ($item, status, callback) {
        var id = parseInt($item.data('id')),
            $assigned_user_icon = $item.find('.pl-done-label').find('.icon16.userpic20'),
            $item_data_wrapper = $item.find('.pl-item'),
            $checkbox = $(this);

        if (status && $item_data_wrapper.data('pl-assigned-contact') && $item_data_wrapper.data('pl-assigned-contact') != o.current_user_id) {
            if (!confirm($_('This to-do is assigned to another person. Are you sure you want to mark this item as complete?'))) {
                $checkbox.prop('checked', false); // uncheck
                callback && $.isFunction(callback) && callback.call($item);
                return;
            }
        }

        $item_data_wrapper.toggleClass('gray');
        $assigned_user_icon.hide();
        $.post(
            '?module=item&action=complete',
            {
                id: id,
                status: status
            },
            function (r) {
                if (r.status === 'ok') {
                    $.pocketlists.updateAppCounter();
                    // remove from undone list
                    $checkbox.prop('checked', status); // check nesting items
                    setTimeout(function () {
                        $item.slideToggle(200, function () {
                            $assigned_user_icon.show();

                            if (status) {
                                if ($done_items_wrapper.length) {
                                    $done_items_wrapper.prepend($item);
                                    $item.show();
                                }
                                $item.find('.pl-reply').hide();
                            } else {
                                $undone_items_wrapper.length && $undone_items_wrapper.append($item.show());
                                $item.find('.pl-reply').show();
                                updateSort();
                            }

                            // always update list count icon
                            updateListCountBadge();

                            $show_logbook_items.show().find('i').text($_('Show all ' + $done_items_wrapper.find('[data-id]').length + ' completed to-dos')); // update "complete items" heading

                            $.pocketlists.reloadSidebar();

                            showEmptyListMessage();

                            callback && $.isFunction(callback) && callback.call($item);
                        });
                    }, 800);

                } else {
                    $assigned_user_icon.show();
                    alert(r.errors);
                }
                $.pocketlists.$loading.remove();
            },
            'json'
        );
    };
    // increase item level
    var increaseItem = function (e) {
        //var $items = $undone_items_wrapper.find('.pl-item-selected').closest(item_selector);
        if (o.enableChangeLevel && $current_item) {
            e.preventDefault();
            e.stopPropagation();
            $current_item.each(function () {
                var $item = $(this),
                    $prev = $item.prev(item_selector);
                if ($prev.length) { // not first
                    var parent_id = parseInt($prev.data('id'));
                    $item.data('parent-id', parent_id); // update parent id

                    var $nested = $prev.find('ul.menu-v').first();
                    if ($nested.length) {
                        $nested.append($item);
                    } else {
                        $prev.append($('<ul class="menu-v">').html($item));
                    }

                    updateSort(parseInt($item.data('id')));
                }
            });
        }
    };
    // decrease item level
    var decreaseItem = function (e) {
        //var $items = $undone_items_wrapper.find('.pl-item-selected').closest(item_selector);
        if (o.enableChangeLevel && $current_item) {
            e.preventDefault();
            e.stopPropagation();
            $current_item.each(function () {
                var $item = $(this),
                    $prev = $item.parents(item_selector).first();
                if ($prev.length) { // not first level
                    var parent_id = parseInt($prev.data('parent-id'));

                    $item.data('parent-id', parent_id); // update parent id

                    var $items_same_level = $item.nextAll(), // all next items on same level
                        $item_children_wrapper = $item.find('ul.menu-v'); // item children wrapper

                    if (!$item_children_wrapper.length) { // create if not exist
                        $item_children_wrapper = $('<ul class="menu-v">');
                        $item.append($item_children_wrapper);
                    }
                    $item_children_wrapper.append($items_same_level); // now will be children of current

                    $prev.after($item);

                    updateSort(parseInt($item.data('id')));
                }
            });
        }
    };
    // favorite item
    var favoriteItem = function($item) {
        if (request_in_action) {
            return;
        }
        request_in_action = true;

        var $star = $item.find('[class*="star"]'),
            id = parseInt($item.data('id')),
            status = $star.hasClass('star-empty') ? 1 : 0;
        $.post(
            '?module=item&action=favorite',
            {
                id: id,
                status: status
            },
            function (r) {
                if (r.status === 'ok') {
                    var $favorites_count = $('[data-pl-sidebar="favorites-count"]'),
                        current_favorites_count = parseInt($favorites_count.text());

                    if (status && current_favorites_count >= 0) {
                        current_favorites_count++;
                    } else if (!status && current_favorites_count > 0) {
                        current_favorites_count--;
                    }
                    $favorites_count.text(current_favorites_count);
                    $star.toggleClass('star-empty star');
                } else {
                    alert(r.errors);
                }
                request_in_action = false;
                //$.pocketlists.$loading.remove();
            },
            'json'
        );
    };
    // select clicked item
    var selectItem = function($item) {
        $current_item = $item;
        if ($current_item) {
            var $item_data_wrapper = $current_item.find('.pl-item').first();

            $list_items_wrapper.find('.pl-item').removeClass('pl-item-selected'); // remove selected class from all items
            $item_data_wrapper.addClass('pl-item-selected'); // add to currently clicked item
            $current_item.prop('checked', true);
        }
    };
    // deselect clicked item
    var deselectItem = function() {
        if ($current_item) {
            $list_items_wrapper.find('.pl-item').removeClass('pl-item-selected');
            $current_item.prop('checked', false);
            $current_item = null;
        }
    };
    // remove item row
    var removeItem = function(id) {
        $list_items_wrapper.find('[data-id="' + id + '"]').remove();
    };
    var replaceItem = function(data) {
        if ($current_item) {
            $current_item.find('.pl-item').first().replaceWith($(data).addClass('pl-item-selected'));
        }
    };
    var updateListCountBadge = function() {
        if (o.list && o.list.list_id) {
            $('#pl-lists')
                .find('[data-pl-list-id="' + o.list.list_id + '"]')
                .find('.count').text($undone_items_wrapper.find('[data-id]').length);
        }
    };
    var isEmptyList = function() {
        return getItems().length ? false : true;
    };
    var isNewList = function () {
        return o.list && o.list.list_id < 0;
    };
    var showEmptyListMessage = function() {
        if (isEmptyList() && o.showMessageOnEmptyList) {
            $empty_list_msg.show();
            //$('.pl-title h1').css('opacity','0.25');
        }
    };
    var hideEmptyListMessage = function() {
        if (o.showMessageOnEmptyList)  {
            $empty_list_msg.hide();
            //$('.pl-title h1').css('opacity','1');
        }
    };
    var showChatCommentInput = function() {
        if ($current_item.length) {
            $current_item.find('.pl-chat').show().find('textarea').trigger('focus');
        }
    };
    var hideChatCommentInput = function() {
        if ($current_item.length) {
            var $comments_wrapper = $current_item.find('.pl-chat'),
                $comment_input = $comments_wrapper.find('textarea');
            $comment_input.trigger('blur');
            if (!$current_item.find('.pl-cue').length) {
                $comments_wrapper.hide();
            }
        }
    };
    var addComment = function(data) {
        if (request_in_action) {
            return;
        }
        request_in_action = true;

        var $this = $(this),
            item_id = $this.closest(item_selector).data('id'),
            $reply_wrapper = $this.closest('.pl-reply'),
            $userpic = $reply_wrapper.find('.icon16');

        $userpic.hide();
        $reply_wrapper.prepend($.pocketlists.$loading.css({
            'margin-top': 1,
            'margin-left': 12
        }));
        $.post(
            '?module=comment&action=add',
            {
                item_id: item_id,
                comment: data.comment
            },
            function (r) {
                $.pocketlists.$loading.removeAttr('style').remove();
                $userpic.show();
                if (r.status === 'ok') {
                    var $reply_wrapper = $this.closest('.pl-reply'),
                        $user_pic = $reply_wrapper.find('i').clone(),
                        $my_reply = $('<div class="pl-cue pl-my-cue">');

                    // todo: use template
                    $my_reply.append(
                        $('<div class="pl-cue-inner">').append(
                            '<div class="pl-bubble"></div></div>',
                            $user_pic,
                            ' ' + r.data.username,
                            ' <span class="hint">' + r.data.datetime + '</span>')
                    );
                    $my_reply.find('.pl-bubble').html(r.data.comment + '<a href="#" class="pl-delete-comment" data-pl-action="comment-delete" title="' + $_('Delete') + '">&times;</a>');
                    $this.closest('.pl-reply').before($my_reply);

                    $this.val('').trigger('focus');
                    $.pocketlists.resizeTextarea($this);
                }
                request_in_action = false;
            },
            'json'
        );
    };
    var deleteComment = function() {
        if (!confirm($_('This will permanently delete this comment. Are you sure?'))) {
            return;
        }

        if (request_in_action) {
            return;
        }
        request_in_action = true;

        var $this = $(this),
            $comment_wrapper = $this.closest('[data-pl-comment-id]'),
            comment_id = $comment_wrapper.data('pl-comment-id');

        $.post(
            '?module=comment&action=delete',
            {
                id: comment_id
            },
            function (r) {
                $.pocketlists.$loading.removeAttr('style').remove();
                if (r.status === 'ok') {
                    $comment_wrapper.slideUp(200, function () {
                        $comment_wrapper.remove();
                    });
                }
                request_in_action = false;
            },
            'json'
        );
    };


    /**
     * for new item dom manipulating
     */
    var NewItemWrapper = (function($new_item_wrapper) {
        var $new_item_wrapper_hover = $('<div id="pl-item-add-wrapper-hover" style="display: none;">'),
            $top_new_item_wrapper = $new_item_wrapper.clone(),
            $textarea = $new_item_wrapper.find('textarea'),
            $top_textarea = $top_new_item_wrapper.find('textarea');

        var hide_new_item_wrapper = function () {
            $new_item_wrapper.slideUp(200, function () {
                $new_item_wrapper.detach();
                $('.pl-new-item-wrapper').remove();
                $textarea.val('');
                showEmptyListMessage();
            });
        };

        var enable_prevent_close_browser = function ($el) {
            window.onbeforeunload = function() {
                $el.data('can_blur', false);
                return $_('Close?');
            };
        };

        var disable_prevent_close_browser = function () {
            window.onbeforeunload = function(e) {};
        };

        var init = function () {
            $new_item_wrapper.detach();

            var show_new_item_wrapper = function () {
                // hideEmptyListMessage();
                $top_new_item_wrapper.prependTo($undone_items_wrapper).show().wrap('<li data-pl-item-add-top>');
                setTimeout(function () {
                    if (isEmptyList()/* && !o.showMessageOnEmptyList*/) {
                        $top_textarea.val('').trigger('focus');
                    }
                }, 500);
            };
            !isNewList() && show_new_item_wrapper();

            // handlers for both textareas (top and movable)
            $textarea.add($top_textarea)
                .on('change cut keydown drop paste', function () {
                    window.setTimeout(function () {
                        $.pocketlists.resizeTextarea($textarea)
                    }, 0);
                })
                .on('keydown', function (e) {
                    var $this = $(this);
                    enable_prevent_close_browser($this);
                    $this.data('can_blur', true);
                    if (!e.shiftKey && e.which === 13) {
                        e.preventDefault();
                        disable_prevent_close_browser();
                        var parent_id = $this.closest('.menu-v').find(item_selector).first().data('parent-id'),
                            name = $this.val().trim();
                        if (name) {
                            addItem.call(this, [{
                                name: name,
                                parent_id: parent_id
                            }]);
                        }
                    } else if (e.which === 27) {
                        $this.data('can_blur', false);
                        disable_prevent_close_browser();
                        hide_new_item_wrapper();
                    }
                })
                .on('paste', function () {
                    var self = this,
                        parent_id = $(this).closest('.menu-v').find(item_selector).first().data('parent-id');

                    if (!$(this).val().length) {
                        setTimeout(function () {
                            var items = $textarea.val().split(/\n/);
                            var data = [];
                            if (items.length > 1) {
                                for (var i = 0; i < items.length; i++) {
                                    var name = $.trim(items[i]);
                                    if (name) {
                                        data.push({
                                            name: name,
                                            parent_id: parent_id
                                        });
                                    }
                                }
                                addItem.call(self, data);
                            }
                        }, 100);
                    }
                })
                .on('focus', function () {
                    var $this = $(this);

                    $this.data('can_blur', true);
                })
                .on('blur', function () {
                    var $this = $(this),
                        parent_id = $this.closest('.menu-v').find(item_selector).first().data('parent-id'),
                        name = $this.val().trim(),
                        can_blur = $this.data('can_blur');

                    if (can_blur) {
                        disable_prevent_close_browser($this);

                        if (name) {
                            addItem.call(this, [{
                                name: name,
                                parent_id: parent_id
                            }], hide_new_item_wrapper);
                        } else {
                            hide_new_item_wrapper();
                        }
                    }
                });

            //$wrapper.on('hide.pl2', hide_new_item_wrapper);
            var undone_items_wrapper_hover_timeout = null;
            if (o.enableAddLinkOnHover) {
                $undone_items_wrapper
                    .on('mouseenter', item_selector + ' > .pl-item', function (e) {
                        e.stopPropagation();
                        var $item = $(this);
                        undone_items_wrapper_hover_timeout = setTimeout(function () {
                            if (!$item.find($new_item_wrapper).length) { // if no placeholder here
                                $item.find('.pl-chat').after($new_item_wrapper_hover.show());
                            }
                        }, 1312);
                    })
                    .on('mouseleave', item_selector + ' > .pl-item', function () {
                        clearTimeout(undone_items_wrapper_hover_timeout);
                        $new_item_wrapper_hover.detach();
                    });

                $new_item_wrapper_hover.on('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();

                    // if item has children - place it before first
                    var $item = $(this);
                    var $has_children = $item.closest(item_selector).find('.menu-v');

                    $textarea.data('can_blur', false);
                    if ($has_children.length) { // if item has children - indent
                        $has_children.find('.pl-item').first().before($new_item_wrapper);
                    } else { // else on same level
                        $item.closest(item_selector).find('.pl-item').first().after($new_item_wrapper);
                    }
                    $new_item_wrapper_hover.detach();
                    $new_item_wrapper.slideDown(200);
                    $textarea.focus();
                    $textarea.data('can_blur', true);
                });
            }
        };

        init();

        return {
            hide: hide_new_item_wrapper,
            new_item: {
                wrapper: $new_item_wrapper,
                textarea: $textarea
            },
            top_new_item: {
                wrapper: $top_new_item_wrapper.closest('[data-pl-item-add-top]'),
                textarea: $top_textarea
            }
        }
    }($('[data-pl-item-add]')));

    /**
     * for item details
     * - show/hide (p)
     * - change details
     */
    var ItemDetails = (function ($wrapper) {
        var id = 0;

        var hideItemDetails = function () {
            $wrapper.animate({
                'right': '-100%'
            }, 200, function() {
                $wrapper.hide().empty()
            });
            id = 0;
            $list_items_wrapper.trigger('deselectItem.pl2');
        };
        var showItemDetails = function (id_item) {
            if (request_in_action) {
                return;
            }
            request_in_action = true;

            id = id_item;
            //$wrapper.html($.pocketlists.$loading).show();
            $wrapper.html($.pocketlists.$loading).show().animate({
                'right': '0%'
            }, 200, function() {
                $.pocketlists.stickyDetailsSidebar();
            });
            $.post('?module=item&action=details',{ id: id }, function (html) {
                $wrapper.html(html);
                afterLoad();
                request_in_action = false;
            });
        };
        var afterLoad = function() {
            var datepicker_options = {
                changeMonth: true,
                changeYear: true,
                shortYearCutoff: 2,
                dateShowWeek: false,
                showOtherMonths: true,
                selectOtherMonths: true,
                stepMonths: 1,
                numberOfMonths: 1,
                gotoCurrent: true,
                constrainInput: false,
                dateFormat: "yy-mm-dd",
                onClose: function() {
                    if ($wrapper.find('#pl-item-due-datetime').val()) {
                        if (!$wrapper.find('#pl-item-due-datetime-clear').is(':visible')) {
                            $wrapper.find('#pl-item-due-datetime-set').show();
                        }
                    } else {
                        $wrapper.find('#pl-item-due-datetime-set, #pl-item-due-datetime-hours, #pl-item-due-datetime-minutes, #pl-item-due-datetime-clear').hide()
                    }
                }
            };

            $wrapper.find('#pl-item-due-datetime').datepicker(datepicker_options);

            $wrapper.find('[data-pl-item-details-fileupload]').fileupload({
                url: '?module=item&action=addAttachment',
                dataType: 'json',
                autoUpload: true,
                dropZone: '[data-pl-item-details-fileupload]',
                formData: {
                    item_id: id
                },
                done: function (e, data) {
                    var $attachments = $wrapper.find('[data-pl-item-details-attachments]');
                    $.each(data.result.data.files, function (index, file) {
                        $attachments.find('ul').append('<li><a href="' + file.path + '/' + file.name + '" target="_blank"><i class="icon16 download"></i>' + file.name + '</a> <a href="#" class="small inline-link" data-pl-attachment-name="' + file.name + '" style="margin-left: 10px;"> <b>' + $_('Delete') + '</b> </a></li>');
                    });
                },
                progressall: function (e, data) {
                    var progress = parseInt(data.loaded / data.total * 100, 10);
                    $wrapper.find('#progress .progress-bar').css(
                        'width',
                        progress + '%'
                    );
                }
            });

        };

        var init = function () {
            if ($wrapper.data('pl-ItemDetails')) {
                return;
            }
            $wrapper.data('pl-ItemDetails', true);

            //id = parseInt($wrapper.find('input[name="item\[id\]"]').val());
            $wrapper
                .on('submit', 'form', function () {
                    //e.preventDefault();
                    var $this = $(this);
                    $this.find('#pl-item-details-save').after($.pocketlists.$loading);
                    updateItem($this, function() {
                        $this.find('#pl-item-details-save').removeClass('yellow');
                        hideItemDetails();
                    });
                })
                .on('click', '#pl-item-details-cancel', function (e) {
                    e.preventDefault();

                    hideItemDetails();
                })
                .on('click', '#pl-item-priority a', function (e) {
                    e.preventDefault();
                    $('#pl-item-priority').find('input').val($(this).data('pl-item-priority')).trigger('change');
                    $(this).addClass('selected').siblings().removeClass('selected')
                })
                .on('click', '#pl-item-due-datetime-set', function (e) {
                    e.preventDefault();
                    var $this = $(this);
                    $this.hide().siblings().show().filter('select').prop('disabled', false);
                })
                .on('click', '#pl-item-due-datetime-clear', function (e) {
                    e.preventDefault();
                    var $this = $(this);
                    $this.hide().siblings().show().filter('select').hide().prop('disabled', true);
                })
                .on('click', '[data-pl-action="item-delete"]', function (e) {
                    e.preventDefault();
                    var $dialog_confirm = $('#pl-dialog-delete-item-confirm');

                    if ($dialog_confirm.hasClass('dialog')) {
                        $dialog_confirm.show();
                    } else {
                        $dialog_confirm.waDialog({
                            'height': '140px',
                            'min-height': '140px',
                            'width': '400px',
                            onLoad: function () {
                                //var $d = $(this);
                                //$d.find('h1').text($wrapper.find('input[name="item[name]"]').val());
                            },
                            onSubmit: function (d) {
                                if (request_in_action) {
                                    return;
                                }
                                request_in_action = true;

                                $.post('?module=item&action=delete', {id: id}, function (r) {
                                    if (r.status === 'ok') {
                                        removeItem(r.data.id);
                                        $list_items_wrapper.find('[data-id="' + r.data.id + '"]').remove();
                                        d.trigger('close');
                                        hideItemDetails();
                                        updateListCountBadge();
                                    } else {

                                    }
                                    request_in_action = false;
                                }, 'json');
                                return false;
                            }
                        });
                    }
                })
                .on('change', '#pl-assigned-contact select', function () {
                    var assigned_contact_id = $(this).val();
                    $('#pl-assigned-contact').find('[data-pl-contact-id="' + assigned_contact_id + '"]').show().siblings().hide();
                })
                .on('change paste keyup', ':input', function () {
                    $wrapper.find('#pl-item-details-save').addClass('yellow');
                })
                .on('show.pl2', function(e, id){
                    showItemDetails(id);
                })
                .on('hide.pl2', hideItemDetails)
                .on('change', '#pl-item-pocket', function() {
                    if (request_in_action) {
                        return;
                    }
                    request_in_action = true;

                    $(this).after($.pocketlists.$loading);
                    $.get('?module=json&action=getLists', function (r) {
                        $.pocketlists.$loading.remove();
                        var $pocket_lists = $('#pl-item-list');
                        $pocket_lists.empty();
                        if (r.status === 'ok') {
                            $.each(r.data, function () {
                                $pocket_lists.append($('<option value="' + this.id + '">').text(this.name));
                            });
                        } else {
                            $pocket_lists.append('<option value="" selected="selected">' + $_('None') + '</option>');
                        }
                        $pocket_lists.trigger('change');
                        request_in_action = false;
                    }, 'json');
                })
                .on('change', '#pl-item-list', function() {
                    var item_id = $(this).find(':selected').val();
                    $wrapper.find('input[name="item\[list_id\]"]').val(item_id);
                    if (item_id) {
                        $(this).show();
                        $wrapper.find('#pl-null-list-msg').hide();
                    } else {
                        $(this).hide();
                        $wrapper.find('#pl-null-list-msg').show();
                    }
                })
                .on('click', '[data-pl-attachment-name]', function (e) {
                    e.preventDefault();

                    if (!confirm($_('Are you sure you want to delete this file?'))) {
                        return false;
                    }

                    var $this = $(this),
                        attachment_name = $this.data('pl-attachment-name'),
                        $w = $this.closest('li');
                    $.post('?module=item&action=deleteAttachment', {
                        attachment: attachment_name,
                        item_id: id
                    }, function (r) {
                        if (r.status === 'ok') {
                            $w.hide(200, function () {
                                $w.remove();
                            });
                        }
                    }, 'json');
                });

            $(window).scroll(function() {
                $.pocketlists.stickyDetailsSidebar();
            });
        };

        init();

        return {
            $el: $wrapper,
            trigger: function(event, data) {
                this.$el && this.$el.trigger(event, data);
            },
            isVisible: function() {
                return this.$el ? this.$el.is(':visible') : false;
            }
        };
    }($('#pl-item-details')));


    var init = function() {
        //if ($.pocketlists_routing.getHash() == '#/todo/' &&
        //    $.pocketlists_routing.getHash().indexOf('/team/') > 0) {
        //    $new_item_wrapper.prependTo($undone_items_wrapper).slideDown(200).wrap('<li class="pl-new-item-wrapper">');
        //    $new_item_input.focus();
        //}

        var do_not_show_item_details = false;

        if (o.archive) {
            $list_items_wrapper.find(':checkbox').prop('disabled', true);
        }

        showEmptyListMessage();
        initSortable();

        $list_items_wrapper
        /**
         * complete/uncomplete item
         */
            .on('click', '.pl-done', function () {
                var $this = $(this),
                    $item = $this.closest(item_selector),
                    status = $this.prop('checked') ? 1 : 0;

                $this.prop('disabled', true);
                completeItem.call(this, $item, status, function() {
                    $this.prop('disabled', false);
                });
            })
        /**
         * select/deselect item
         */
            // todo: do we really need checkbox?
            .on('change', '.pl-is-selected', function (e) {
                var $this = $(this),
                    $item = $this.closest(item_selector),
                    is_selected = ($current_item && $current_item.data('id') == $item.data('id')) ? true : false,
                    item_id = parseInt($item.data('id'));

                e.preventDefault();

                if (item_id) {
                    if (!ItemDetails.isVisible() && !is_selected) { // on first click - select
                        ItemDetails.trigger('hide.pl2');
                        selectItem($item);
                    } else if (!ItemDetails.isVisible()) { // on second - show details
                        ItemDetails.trigger('show.pl2', [item_id]); // show item details
                        selectItem($item);
                        //NewItemWrapper.hide();
                    } else { // on third
                        ItemDetails.trigger('hide.pl2');
                        deselectItem();
                    }
                }
            }) // action: select item
            .on('click', '.pl-comment', function (e) {
                e.preventDefault();

                var $this = $(this),
                    $item = $this.closest(item_selector),
                    item_id = parseInt($item.data('id'));

                if (item_id) {
                    if (!$item.find('.pl-chat').is(':visible') || // if no comments - show input and focus
                        ($item.find('.pl-chat').is(':visible') && $item.find('.pl-cue').length)) { // OR if already visible (there are some comments) - focus
                        selectItem($item);
                        showChatCommentInput();
                    } else { // hide if no comments
                        hideChatCommentInput();
                        deselectItem();
                    }
                }
            })
            .on('click', '.pl-edit', function (e) {
                e.preventDefault();

                var $this = $(this),
                    $item = $this.closest(item_selector);

                ItemDetails.trigger('show.pl2', [parseInt($item.data('id'))]); // show item details
                selectItem($item);
            })
            .on('click', '[data-pl-action="item-favorite"]', function(e) {
                e.preventDefault();
                var $this = $(this),
                    $item = $this.closest(item_selector);

                favoriteItem($item);
            }) // action: favorite item
            .on('increaseSelectedItem.pl2', function(e) {
                increaseItem(e);
            })
            .on('decreaseSelectedItem.pl2', function(e) {
                decreaseItem(e);
            })
            .on('deselectItem.pl2', deselectItem)
            .on('removeItem.pl2', function(e, id) {
                removeItem(id);
            })
            .on('replaceSelectedItem.pl2', function(e, data) {
                replaceItem(data);
            })
            .on('change cut keydown drop paste', '.pl-chat .pl-reply textarea', function () {
                var $textarea = $(this);
                window.setTimeout(function () {
                    $.pocketlists.resizeTextarea($textarea)
                }, 0);
            })
            .on('keydown', '.pl-chat .pl-reply textarea', function(e) {
                var $this = $(this);
                if (!e.shiftKey && e.which === 13) {
                    e.preventDefault();
                    var comment = $this.val().trim();
                    if (comment) {
                        addComment.call(this, {
                            comment: comment
                        });
                    }
                } else if (e.which === 27) {
                    hideChatCommentInput();
                    deselectItem();
                }
            })
            .on('click', '[data-pl-action="comment-delete"]', function (e) {
                e.preventDefault();

                deleteComment.call(this);
            })
            .on('click', '.pl-chat .pl-reply textarea', function(e) {
                e.preventDefault();

                selectItem($(this).closest(item_selector));
            })
            /* calendar day highlight */
            .on('mouseenter mouseleave', '.pl-item-wrapper[data-pl-due-date]', function () {
                var $calendar = $('.pl-calendar');
                if ($calendar.length) {
                    var $day = $calendar.find('[data-pl-todo-date="' + $(this).data('pl-due-date') + '"]');
                    if ($day.length) {
                        $day.toggleClass('highlighted-background');
                    }
                }
            });

        // keyboard
        $(document).on('keydown', function (e) {
            switch (e.which) {
                //case 39: // -->
                //    increase_item.call(this);
                //    break;
                case 9: // tab
                    if (!(o.list && o.list.list_details.isVisible()) && !ItemDetails.isVisible()) {
                        if (e.shiftKey) {
                            decreaseItem(e);
                        } else {
                            increaseItem(e);
                        }
                    }
                    break;
                //case 37: // <--
                //    decrease_item.call(this);
                //    break;
                case 27: // esc
                    //($current_item.length && $current_item.find('.pl-chat').is(':visible')) && hideChatCommentInput();
                    ItemDetails.isVisible() && ItemDetails.trigger('hide.pl2');
                    break;
            }
        });

        // show logbook items
        $show_logbook_items.click(function () {
            $done_items.slideDown(200);
            $(this).slideUp(200);
            return false;
        });
    };

    init();

    return {
        $el: $list_items_wrapper,
        trigger: function(event, data) {
            this.$el && this.$el.trigger(event, data);
        }
    };
};
